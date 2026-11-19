import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/env';
import { Op } from 'sequelize';
import { Booking, BookingStatusHistory, Role, Tour, User } from '../src/db/models';
import { maskPersonalData } from '../src/lib/demo';
import { api, createTour, createUser, sessionCookie } from './helpers';

// The config object is read-only for app code; tests switch DEMO_MODE on and off here.
const setDemoMode = (enabled: boolean) => {
    (config.demo as { enabled: boolean }).enabled = enabled;
};

const demo = (role: string) => api().post('/api/auth/demo').send({ role });

const createDemoUser = async (role: 'customer' | 'admin') => {
    const roleRow = await Role.findOne({ where: { name: role } });
    const email = role === 'admin' ? config.demo.adminEmail : config.demo.customerEmail;
    const [user] = await User.findOrCreate({
        where: { email },
        defaults: {
            email,
            full_name: `Demo ${role}`,
            password: bcrypt.hashSync('unused', 4),
            role_id: roleRow!.role_id,
        },
    });
    return user;
};

describe('demo accounts', () => {
    beforeAll(() => {
        setDemoMode(true);
    });
    afterAll(() => {
        setDemoMode(false);
    });

    it('is off unless DEMO_MODE is set', async () => {
        setDemoMode(false);
        expect((await api().get('/api/auth/demo')).body).toEqual({ enabled: false });
        expect((await demo('customer')).status).toBe(404);
        setDemoMode(true);
        expect((await api().get('/api/auth/demo')).body).toEqual({ enabled: true });
    });

    it('rejects unknown roles and answers 503 when the account was not created', async () => {
        expect((await demo('superuser')).status).toBe(400);
        await User.destroy({ where: { email: config.demo.adminEmail }, force: true });
        expect((await demo('admin')).status).toBe(503);
    });

    it('the demo customer signs in without a password and may book, but not change the account', async () => {
        await createDemoUser('customer');
        const admin = await createUser('admin');
        const tour = await createTour(admin.auth, { spots: 5 });

        const res = await demo('customer');
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ email: config.demo.customerEmail, role: 'customer', demo: true });
        expect(sessionCookie(res)).toBeDefined();
        const auth = { Authorization: `Bearer ${res.body.token}` };

        const booking = await api().post('/api/booking').set(auth).send({ tour_id: tour.tour_id, number_of_people: 2 });
        expect(booking.status).toBe(201);
        expect((await api().post('/api/favorite').set(auth).send({ tour_id: tour.tour_id })).status).toBe(201);

        const info = await api()
            .put('/api/account/info')
            .set(auth)
            .send({ full_name: 'Hacked', email: 'x@example.com' });
        expect(info.status).toBe(403);
        expect(info.body).toMatchObject({ demo: true, message: expect.stringMatching(/demo account/) });
        const password = await api()
            .put('/api/account/password')
            .set(auth)
            .send({ current_password: 'unused', new_password: 'An0ther!Pass' });
        expect(password.status).toBe(403);
    });

    it('a refreshed token is still a demo token', async () => {
        const cookie = sessionCookie(await demo('customer'))!;
        const refreshed = await api().post('/api/auth/refresh').set('Cookie', cookie);
        expect(refreshed.body.user.demo).toBe(true);
        const info = await api()
            .put('/api/account/info')
            .set('Authorization', `Bearer ${refreshed.body.token}`)
            .send({ full_name: 'Hacked' });
        expect(info.status).toBe(403);
    });

    it('the demo admin is read-only and sees personal data masked', async () => {
        await createDemoUser('admin');
        const real = await createUser('customer');
        const res = await demo('admin');
        expect(res.status).toBe(200);
        const auth = { Authorization: `Bearer ${res.body.token}` };

        const users = await api().get('/api/account?limit=100').set(auth);
        expect(users.status).toBe(200);
        const body = JSON.stringify(users.body);
        expect(body).not.toContain(real.user.email);
        expect(body).toContain(`${real.user.email[0]}•••@example.test`);
        // Its own address stays readable.
        expect(body).toContain(config.demo.adminEmail);

        expect((await api().post('/api/categories').set(auth).send({ name: 'Nope' })).status).toBe(403);
        expect((await api().delete(`/api/account/${real.user.user_id}`).set(auth)).status).toBe(403);
        expect(await User.findByPk(real.user.user_id)).not.toBeNull();
    });

    it('the demo customer’s bookings older than a day are removed and the seats released', async () => {
        const customer = await createDemoUser('customer');
        const admin = await createUser('admin');
        const tour = await createTour(admin.auth, { spots: 6 });
        const auth = { Authorization: `Bearer ${(await demo('customer')).body.token}` };
        const created = await api().post('/api/booking').set(auth).send({ tour_id: tour.tour_id, number_of_people: 3 });
        expect(created.status).toBe(201);
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(3);

        await Booking.update({ createdAt: new Date(Date.now() - 25 * 3_600_000) } as never, {
            where: { booking_id: created.body.booking_id },
            silent: true,
        });
        await demo('customer');

        expect(await Booking.findByPk(created.body.booking_id)).toBeNull();
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(6);
        expect(customer.user_id).toBe(created.body.user_id);
    });

    it('the demo customer gets one finished trip on the most recently ended tour, and may review it', async () => {
        const customer = await createDemoUser('customer');
        const admin = await createUser('admin');
        await createTour(admin.auth, { daysAhead: -5.001, spots: 4 }); // ended a moment ago
        const latest = (await Tour.findOne({
            where: { end_date: { [Op.lt]: new Date() } },
            order: [['end_date', 'DESC']],
        }))!;

        const auth = { Authorization: `Bearer ${(await demo('customer')).body.token}` };
        await demo('customer'); // a second sign-in adds nothing

        const trips = await Booking.findAll({ where: { user_id: customer.user_id, tour_id: latest.tour_id } });
        expect(trips).toHaveLength(1);
        expect(trips[0]).toMatchObject({ status: 'completed', number_of_people: 2 });
        expect(new Date(trips[0].booking_date).getTime()).toBeLessThan(new Date(latest.start_date).getTime());
        expect(await BookingStatusHistory.count({ where: { booking_id: trips[0].booking_id } })).toBe(2);
        // Completed bookings hold no seats.
        expect((await Tour.findByPk(latest.tour_id))!.available_spots).toBe(latest.available_spots);

        const past = await api().get('/api/booking/my?view=past').set(auth);
        expect(JSON.stringify(past.body)).toContain(`"booking_id":${trips[0].booking_id}`);
        expect((await api().get(`/api/review/eligibility/${latest.tour_id}`).set(auth)).body).toEqual({
            canReview: true,
            reason: 'eligible',
        });
    });

    it('reviews from the demo account are only shown to that account, not to others or in the stats', async () => {
        const admin = await createUser('admin');
        const latest = (await Tour.findOne({
            where: { end_date: { [Op.lt]: new Date() } },
            order: [['end_date', 'DESC']],
        }))!;
        const auth = { Authorization: `Bearer ${(await demo('customer')).body.token}` };
        const reviewsBefore = (await api().get('/api/stats').set(admin.auth)).body.metrics.totalReviews;

        const review = await api()
            .post('/api/review')
            .set(auth)
            .send({ tour_id: latest.tour_id, rating: 5, comment: 'Anything a visitor writes' });
        expect(review.status).toBe(201);
        const listed = (res: { body: { reviews: { review_id: number }[] } }) =>
            res.body.reviews.map((r) => r.review_id);

        expect(listed(await api().get(`/api/review/tour/${latest.tour_id}?limit=50`))).not.toContain(
            review.body.review_id,
        );
        expect(listed(await api().get(`/api/review/tour/${latest.tour_id}?limit=50`).set(admin.auth))).not.toContain(
            review.body.review_id,
        );
        expect(listed(await api().get(`/api/review/tour/${latest.tour_id}?limit=50`).set(auth))).toContain(
            review.body.review_id,
        );
        expect(listed(await api().get('/api/review?limit=50'))).not.toContain(review.body.review_id);
        expect(listed(await api().get('/api/review/my').set(auth))).toContain(review.body.review_id);
        expect((await api().get('/api/stats').set(admin.auth)).body.metrics.totalReviews).toBe(reviewsBefore);
    });
});

describe('maskPersonalData', () => {
    it('hides booking free text: cancellation reasons and status notes', () => {
        expect(
            maskPersonalData({
                bookings: [{ booking_id: 1, status: 'cancelled', cancellation_reason: 'My mother is ill' }],
                history: [{ id: 2, note: 'Called +1 555 0100', note_empty: '' }],
            }),
        ).toEqual({
            bookings: [{ booking_id: 1, status: 'cancelled', cancellation_reason: '(hidden in the demo)' }],
            history: [{ id: 2, note: '(hidden in the demo)', note_empty: '' }],
        });
    });

    it('masks contact details and contact messages but not status messages', () => {
        expect(
            maskPersonalData({
                message: 'Booking cancelled successfully',
                rows: [
                    {
                        contact_id: 1,
                        full_name: 'Ada Lovelace',
                        email: 'ada@example.org',
                        phone_number: '+1 555',
                        message: 'private',
                    },
                ],
            }),
        ).toEqual({
            message: 'Booking cancelled successfully',
            rows: [
                {
                    contact_id: 1,
                    full_name: 'A. L.',
                    email: 'a•••@example.org',
                    phone_number: '•••',
                    message: '(hidden in the demo)',
                },
            ],
        });
    });
});
