import { beforeAll, describe, expect, it } from 'vitest';
import { Booking, BookingStatusHistory, Tour } from '../src/db/models';
import type { BookingStatus } from '../src/db/models/booking.model';
import { TRANSITIONS, completeFinishedBookings, nextStatuses } from '../src/lib/bookings';
import { api, createTour, createUser } from './helpers';

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
    admin = await createUser('admin');
});

const newBooking = async (spots = 5, people = 2) => {
    const tour = await createTour(admin.auth, { spots });
    const customer = await createUser();
    const { body } = await api()
        .post('/api/booking')
        .set(customer.auth)
        .send({ tour_id: tour.tour_id, number_of_people: people })
        .expect(201);
    return { tour, customer, booking: body as { booking_id: number } };
};

const setStatus = (booking_id: number, status: string, note?: string) =>
    api().patch(`/api/booking/${booking_id}/status`).set(admin.auth).send({ status, note });

describe('transition table', () => {
    it('allows only the documented moves and has final states', () => {
        expect(nextStatuses('pending')).toEqual(['confirmed', 'cancelled']);
        expect(nextStatuses('confirmed')).toEqual(['completed', 'no_show', 'cancelled']);
        expect(nextStatuses('completed')).toEqual(['refunded']);
        for (const final of ['cancelled', 'no_show', 'refunded'] as BookingStatus[]) {
            expect(nextStatuses(final)).toEqual([]);
        }
        // Nothing ever goes back to pending.
        expect(Object.values(TRANSITIONS).flat()).not.toContain('pending');
    });
});

describe('PATCH /api/booking/:id/status', () => {
    it('walks pending → confirmed → completed → refunded and records each step', async () => {
        const { booking, customer } = await newBooking();

        for (const status of ['confirmed', 'completed', 'refunded']) {
            const res = await setStatus(booking.booking_id, status, `to ${status}`);
            expect(res.status).toBe(200);
            expect(res.body.booking.status).toBe(status);
        }
        expect((await setStatus(booking.booking_id, 'refunded')).body.booking).toBeUndefined();

        const history = await api().get(`/api/booking/${booking.booking_id}/history`).set(admin.auth);
        expect(history.status).toBe(200);
        expect(
            history.body.history.map((h: { from_status: string | null; to_status: string }) => [
                h.from_status,
                h.to_status,
            ]),
        ).toEqual([
            [null, 'pending'],
            ['pending', 'confirmed'],
            ['confirmed', 'completed'],
            ['completed', 'refunded'],
        ]);
        expect(history.body.history[0].changed_by).toBe(customer.user.user_id);
        expect(history.body.history[1]).toMatchObject({ changed_by: admin.user.user_id, note: 'to confirmed' });
        expect(history.body.history[1].ChangedBy.full_name).toBe('Test admin');
    });

    it('answers 409 with the allowed next states for a disallowed move', async () => {
        const { booking } = await newBooking();
        const res = await setStatus(booking.booking_id, 'completed');
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ status: 'pending', allowed: ['confirmed', 'cancelled'] });
        expect((await setStatus(booking.booking_id, 'pending')).status).toBe(409);
        expect((await setStatus(booking.booking_id, 'lost')).status).toBe(400);
        expect((await setStatus(999999, 'confirmed')).status).toBe(404);
    });

    it('cancelling via status releases the seats exactly once', async () => {
        const { booking, tour } = await newBooking(6, 4);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(2);

        await setStatus(booking.booking_id, 'confirmed').expect(200);
        const results = await Promise.all([
            setStatus(booking.booking_id, 'cancelled', 'Overbooked'),
            setStatus(booking.booking_id, 'cancelled', 'Overbooked'),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(6);

        const row = await Booking.findByPk(booking.booking_id);
        expect(row).toMatchObject({
            status: 'cancelled',
            cancelled_by: admin.user.user_id,
            cancellation_reason: 'Overbooked',
        });
    });

    it('is admin only, and the old confirm route still works', async () => {
        const { booking, customer } = await newBooking();
        expect(
            (
                await api()
                    .patch(`/api/booking/${booking.booking_id}/status`)
                    .set(customer.auth)
                    .send({ status: 'confirmed' })
            ).status,
        ).toBe(403);
        expect((await api().get(`/api/booking/${booking.booking_id}/history`).set(customer.auth)).status).toBe(403);

        const confirm = await api().patch(`/api/booking/${booking.booking_id}/confirm`).set(admin.auth);
        expect(confirm.status).toBe(200);
        expect(confirm.body.booking.status).toBe('confirmed');
    });

    it('the admin list says which moves each booking allows', async () => {
        const { booking } = await newBooking();
        const list = await api().get('/api/booking?status=pending&limit=100').set(admin.auth);
        const row = list.body.bookings.find((b: { booking_id: number }) => b.booking_id === booking.booking_id);
        expect(row.next_statuses).toEqual(['confirmed', 'cancelled']);
    });
});

describe('automatic completion and revenue', () => {
    it('marks confirmed bookings of finished tours completed and counts their revenue', async () => {
        const before = (await api().get('/api/stats').set(admin.auth)).body.metrics;

        const finished = await newBooking(5, 2); // 200.20
        const stillPending = await newBooking(5, 1);
        const upcoming = await newBooking(5, 3); // 300.30
        await setStatus(finished.booking.booking_id, 'confirmed').expect(200);
        await setStatus(upcoming.booking.booking_id, 'confirmed').expect(200);
        const past = {
            start_date: new Date(Date.now() - 9 * 86_400_000),
            end_date: new Date(Date.now() - 2 * 86_400_000),
        };
        await Tour.update(past, { where: { tour_id: [finished.tour.tour_id, stillPending.tour.tour_id] } });

        const mine = await api().get('/api/booking/my?view=past').set(finished.customer.auth);
        expect(mine.body.bookings[0]).toMatchObject({ booking_id: finished.booking.booking_id, status: 'completed' });
        // A booking nobody confirmed is not completed automatically.
        expect((await Booking.findByPk(stillPending.booking.booking_id))!.status).toBe('pending');

        const auto = await BookingStatusHistory.findOne({
            where: { booking_id: finished.booking.booking_id, to_status: 'completed' },
        });
        expect(auto).toMatchObject({ from_status: 'confirmed', changed_by: null, note: 'Tour ended' });
        expect(await completeFinishedBookings()).toEqual([]);

        const after = (await api().get('/api/stats').set(admin.auth)).body.metrics;
        expect(after.totalRevenue - before.totalRevenue).toBeCloseTo(200.2, 2);
        expect(after.bookedRevenue - before.bookedRevenue).toBeCloseTo(300.3, 2);
    });
});
