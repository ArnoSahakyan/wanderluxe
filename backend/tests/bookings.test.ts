import { beforeAll, describe, expect, it } from 'vitest';
import { Tour } from '../src/db/models';
import { api, createTour, createUser } from './helpers';

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
    admin = await createUser('admin');
});

describe('POST /api/booking', () => {
    it('books seats, computes the price and decrements availability', async () => {
        const tour = await createTour(admin.auth, { spots: 5 });
        const customer = await createUser();

        const res = await api().post('/api/booking').set(customer.auth).send({ tour_id: tour.tour_id, number_of_people: 3 });
        expect(res.status).toBe(201);
        expect(Number(res.body.total_price)).toBeCloseTo(300.3, 2);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(2);

        const tooMany = await api().post('/api/booking').set(customer.auth).send({ tour_id: tour.tour_id, number_of_people: 3 });
        expect(tooMany.status).toBe(400);
    });

    it('never oversells under concurrent requests (S-09)', async () => {
        const tour = await createTour(admin.auth, { spots: 2 });
        const customers = await Promise.all(Array.from({ length: 6 }, () => createUser()));

        const results = await Promise.all(
            customers.map((c) => api().post('/api/booking').set(c.auth).send({ tour_id: tour.tour_id, number_of_people: 1 })),
        );
        expect(results.filter((r) => r.status === 201)).toHaveLength(2);
        expect(results.filter((r) => r.status === 400)).toHaveLength(4);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(0);
    });

    it('rejects invalid input and tours that already started', async () => {
        const customer = await createUser();
        const bad = await api().post('/api/booking').set(customer.auth).send({ tour_id: 'x', number_of_people: 1.5 });
        expect(bad.status).toBe(400);

        // tour 2 from the dump started in 2025
        const past = await api().post('/api/booking').set(customer.auth).send({ tour_id: 2, number_of_people: 1 });
        expect(past.status).toBe(400);

        const missing = await api().post('/api/booking').set(customer.auth).send({ tour_id: 999999, number_of_people: 1 });
        expect(missing.status).toBe(404);

        expect((await api().post('/api/booking').send({ tour_id: 2, number_of_people: 1 })).status).toBe(401);
    });
});

describe('GET /api/booking/:id', () => {
    it('owner and admin can read it, other customers cannot (S-02)', async () => {
        const tour = await createTour(admin.auth);
        const owner = await createUser();
        const stranger = await createUser();
        const { body: booking } = await api()
            .post('/api/booking')
            .set(owner.auth)
            .send({ tour_id: tour.tour_id, number_of_people: 1 })
            .expect(201);

        const mine = await api().get(`/api/booking/${booking.booking_id}`).set(owner.auth);
        expect(mine.status).toBe(200);
        expect(mine.body.user).toBeUndefined();

        expect((await api().get(`/api/booking/${booking.booking_id}`).set(stranger.auth)).status).toBe(403);

        const asAdmin = await api().get(`/api/booking/${booking.booking_id}`).set(admin.auth);
        expect(asAdmin.status).toBe(200);
        expect(asAdmin.body.user).toMatchObject({ user_id: owner.user.user_id });
    });
});

describe('cancelling a booking', () => {
    const book = async (auth: Record<string, string>, tour_id: number, number_of_people = 2) =>
        (await api().post('/api/booking').set(auth).send({ tour_id, number_of_people }).expect(201)).body;

    it('keeps the booking as cancelled history and releases the seats; strangers get 403', async () => {
        const tour = await createTour(admin.auth, { spots: 4 });
        const owner = await createUser();
        const stranger = await createUser();
        const booking = await book(owner.auth, tour.tour_id);

        expect((await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(stranger.auth)).status).toBe(403);
        const res = await api()
            .patch(`/api/booking/${booking.booking_id}/cancel`)
            .set(owner.auth)
            .send({ reason: '  Plans changed  ' });
        expect(res.status).toBe(200);
        expect(res.body.booking).toMatchObject({ status: 'cancelled', cancelled_by: owner.user.user_id, cancellation_reason: 'Plans changed' });
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(4);

        const detail = await api().get(`/api/booking/${booking.booking_id}`).set(owner.auth);
        expect(detail.status).toBe(200);
        expect(detail.body).toMatchObject({ status: 'cancelled', cancelled_by_customer: true, cancellation_reason: 'Plans changed' });
        expect(detail.body.cancelled_at).toBeTruthy();
    });

    it('a second cancel is a 409 and does not release the seats again', async () => {
        const tour = await createTour(admin.auth, { spots: 5 });
        const owner = await createUser();
        const booking = await book(owner.auth, tour.tour_id, 3);

        // The old DELETE route is an alias and also keeps the row.
        expect((await api().delete(`/api/booking/${booking.booking_id}`).set(owner.auth)).status).toBe(200);
        const again = await Promise.all([
            api().patch(`/api/booking/${booking.booking_id}/cancel`).set(owner.auth),
            api().patch(`/api/booking/${booking.booking_id}/cancel`).set(admin.auth),
        ]);
        expect(again.map((r) => r.status)).toEqual([409, 409]);
        expect(again[0].body.message).toMatch(/already cancelled/);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(5);
    });

    it('keeps the 3-day rule for customers but not for admins', async () => {
        const tour = await createTour(admin.auth, { daysAhead: 1 });
        const owner = await createUser();
        const booking = await book(owner.auth, tour.tour_id, 1);

        expect((await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(owner.auth)).status).toBe(400);
        const res = await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(admin.auth).send({ reason: 'Weather' });
        expect(res.status).toBe(200);
        const detail = await api().get(`/api/booking/${booking.booking_id}`).set(owner.auth);
        expect(detail.body).toMatchObject({ cancelled_by_customer: false, cancellation_reason: 'Weather' });
    });

    it('rejects an over-long reason', async () => {
        const tour = await createTour(admin.auth);
        const owner = await createUser();
        const booking = await book(owner.auth, tour.tour_id, 1);
        const res = await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(owner.auth).send({ reason: 'x'.repeat(256) });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/booking/my views', () => {
    it('splits bookings into upcoming, past and cancelled', async () => {
        const owner = await createUser();
        const upcoming = await createTour(admin.auth, { daysAhead: 20 });
        const toCancel = await createTour(admin.auth, { daysAhead: 25 });
        const ended = await createTour(admin.auth, { daysAhead: 10 });

        const a = (await api().post('/api/booking').set(owner.auth).send({ tour_id: upcoming.tour_id, number_of_people: 1 })).body;
        const b = (await api().post('/api/booking').set(owner.auth).send({ tour_id: toCancel.tour_id, number_of_people: 1 })).body;
        const c = (await api().post('/api/booking').set(owner.auth).send({ tour_id: ended.tour_id, number_of_people: 1 })).body;
        await api().patch(`/api/booking/${b.booking_id}/cancel`).set(owner.auth).expect(200);
        // Move the third tour into the past.
        await Tour.update(
            { start_date: new Date(Date.now() - 10 * 86_400_000), end_date: new Date(Date.now() - 5 * 86_400_000) },
            { where: { tour_id: ended.tour_id } },
        );

        const ids = async (query: string) =>
            (await api().get(`/api/booking/my${query}`).set(owner.auth).expect(200)).body.bookings.map(
                (x: { booking_id: number }) => x.booking_id,
            );
        expect(await ids('')).toEqual([a.booking_id]);
        expect(await ids('?view=upcoming')).toEqual([a.booking_id]);
        expect(await ids('?view=past')).toEqual([c.booking_id]);
        expect(await ids('?view=cancelled')).toEqual([b.booking_id]);
        expect((await api().get('/api/booking/my?view=everything').set(owner.auth)).status).toBe(400);
    });
});

describe('admin booking routes', () => {
    it('lists and confirms bookings', async () => {
        const tour = await createTour(admin.auth);
        const owner = await createUser();
        const { body: booking } = await api()
            .post('/api/booking')
            .set(owner.auth)
            .send({ tour_id: tour.tour_id, number_of_people: 1 })
            .expect(201);

        expect((await api().get('/api/booking').set(owner.auth)).status).toBe(403);
        const list = await api().get('/api/booking?limit=2').set(admin.auth);
        expect(list.status).toBe(200);
        expect(list.body.bookings.length).toBeLessThanOrEqual(2);

        const confirm = await api().patch(`/api/booking/${booking.booking_id}/confirm`).set(admin.auth);
        expect(confirm.status).toBe(200);
        expect(confirm.body.booking.status).toBe('confirmed');
        expect((await api().patch(`/api/booking/${booking.booking_id}/confirm`).set(admin.auth)).status).toBe(400);

        const confirmed = await api().get('/api/booking?status=confirmed&limit=100').set(admin.auth);
        expect(confirmed.body.bookings.every((b: { status: string }) => b.status === 'confirmed')).toBe(true);
        expect(confirmed.body.bookings.map((b: { booking_id: number }) => b.booking_id)).toContain(booking.booking_id);
        expect((await api().get('/api/booking?status=lost').set(admin.auth)).status).toBe(400);
    });

    it('stats leave cancelled bookings out of the total and count recent cancellations', async () => {
        const before = (await api().get('/api/stats').set(admin.auth)).body.metrics;
        const tour = await createTour(admin.auth);
        const owner = await createUser();
        const { body: booking } = await api()
            .post('/api/booking')
            .set(owner.auth)
            .send({ tour_id: tour.tour_id, number_of_people: 1 })
            .expect(201);
        await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(owner.auth).expect(200);

        const after = (await api().get('/api/stats').set(admin.auth)).body.metrics;
        expect(after.totalBookings).toBe(before.totalBookings);
        expect(after.cancelledLast30Days).toBe(before.cancelledLast30Days + 1);
    });
});
