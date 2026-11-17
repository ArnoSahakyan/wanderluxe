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

describe('DELETE /api/booking/:id', () => {
    it('releases the seats; strangers get 403', async () => {
        const tour = await createTour(admin.auth, { spots: 4 });
        const owner = await createUser();
        const stranger = await createUser();
        const { body: booking } = await api()
            .post('/api/booking')
            .set(owner.auth)
            .send({ tour_id: tour.tour_id, number_of_people: 2 })
            .expect(201);

        expect((await api().delete(`/api/booking/${booking.booking_id}`).set(stranger.auth)).status).toBe(403);
        expect((await api().delete(`/api/booking/${booking.booking_id}`).set(owner.auth)).status).toBe(200);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(4);
        expect((await api().get(`/api/booking/${booking.booking_id}`).set(owner.auth)).status).toBe(404);
    });

    it('keeps the 3-day rule for customers but not for admins', async () => {
        const tour = await createTour(admin.auth, { daysAhead: 1 });
        const owner = await createUser();
        const { body: booking } = await api()
            .post('/api/booking')
            .set(owner.auth)
            .send({ tour_id: tour.tour_id, number_of_people: 1 })
            .expect(201);

        expect((await api().delete(`/api/booking/${booking.booking_id}`).set(owner.auth)).status).toBe(400);
        expect((await api().delete(`/api/booking/${booking.booking_id}`).set(admin.auth)).status).toBe(200);
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
    });
});
