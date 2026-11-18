import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/env';
import { Booking, Role, Tour, User } from '../src/db/models';
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
        defaults: { email, full_name: `Demo ${role}`, password: bcrypt.hashSync('unused', 4), role_id: roleRow!.role_id },
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

        const info = await api().put('/api/account/info').set(auth).send({ full_name: 'Hacked', email: 'x@example.com' });
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

        await Booking.update(
            { createdAt: new Date(Date.now() - 25 * 3_600_000) } as never,
            { where: { booking_id: created.body.booking_id }, silent: true },
        );
        await demo('customer');

        expect(await Booking.findByPk(created.body.booking_id)).toBeNull();
        expect((await Tour.findByPk(tour.tour_id))!.available_spots).toBe(6);
        expect(customer.user_id).toBe(created.body.user_id);
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
                rows: [{ contact_id: 1, full_name: 'Ada Lovelace', email: 'ada@example.org', phone_number: '+1 555', message: 'private' }],
            }),
        ).toEqual({
            message: 'Booking cancelled successfully',
            rows: [{ contact_id: 1, full_name: 'A. L.', email: 'a•••@example.org', phone_number: '•••', message: '(hidden in the demo)' }],
        });
    });
});
