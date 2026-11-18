import { beforeAll, describe, expect, it } from 'vitest';
import { Tour } from '../src/db/models';
import { api, completeTrip, createTour, createUser } from './helpers';

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
    admin = await createUser('admin');
});

const review = (auth: Record<string, string>, tour_id: number) =>
    api().post('/api/review').set(auth).send({ tour_id, rating: 5, comment: 'Lovely' });
const eligibility = async (auth: Record<string, string>, tour_id: number) =>
    (await api().get(`/api/review/eligibility/${tour_id}`).set(auth)).body;
const setStatus = (booking_id: number, status: string) =>
    api().patch(`/api/booking/${booking_id}/status`).set(admin.auth).send({ status }).expect(200);
const book = async (auth: Record<string, string>, tour_id: number) =>
    (await api().post('/api/booking').set(auth).send({ tour_id, number_of_people: 1 }).expect(201)).body as {
        booking_id: number;
    };

describe('reviews only after a completed trip', () => {
    it('without a booking: 403 and eligibility says not travelled', async () => {
        const tour = await createTour(admin.auth);
        const customer = await createUser();
        const res = await review(customer.auth, tour.tour_id);
        expect(res.status).toBe(403);
        expect(res.body.message).toBe('You can review a tour after you have travelled on it.');
        expect(await eligibility(customer.auth, tour.tour_id)).toEqual({ canReview: false, reason: 'not_travelled' });
    });

    it('a confirmed booking for a future tour is not enough', async () => {
        const tour = await createTour(admin.auth);
        const customer = await createUser();
        await setStatus((await book(customer.auth, tour.tour_id)).booking_id, 'confirmed');
        expect((await review(customer.auth, tour.tour_id)).status).toBe(403);
    });

    it('a cancelled booking is not enough', async () => {
        const tour = await createTour(admin.auth);
        const customer = await createUser();
        const booking = await book(customer.auth, tour.tour_id);
        await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(customer.auth).expect(200);
        expect((await review(customer.auth, tour.tour_id)).status).toBe(403);
    });

    it('a completed booking allows exactly one review', async () => {
        const tour = await createTour(admin.auth);
        const customer = await createUser();
        await completeTrip(admin.auth, customer.auth, tour.tour_id);

        expect(await eligibility(customer.auth, tour.tour_id)).toEqual({ canReview: true, reason: 'eligible' });
        expect((await review(customer.auth, tour.tour_id)).status).toBe(201);
        expect((await review(customer.auth, tour.tour_id)).status).toBe(409);
        expect(await eligibility(customer.auth, tour.tour_id)).toEqual({
            canReview: false,
            reason: 'already_reviewed',
        });
    });

    it('a confirmed booking whose tour has ended counts too', async () => {
        const tour = await createTour(admin.auth);
        const customer = await createUser();
        await setStatus((await book(customer.auth, tour.tour_id)).booking_id, 'confirmed');
        await Tour.update(
            { start_date: new Date(Date.now() - 6 * 86_400_000), end_date: new Date(Date.now() - 86_400_000) },
            { where: { tour_id: tour.tour_id } },
        );
        expect((await review(customer.auth, tour.tour_id)).status).toBe(201);
    });

    it('the eligibility endpoint needs a sign-in and an existing tour', async () => {
        const customer = await createUser();
        expect((await api().get('/api/review/eligibility/1')).status).toBe(401);
        expect((await api().get('/api/review/eligibility/999999').set(customer.auth)).status).toBe(404);
        expect((await api().get('/api/review/eligibility/abc').set(customer.auth)).status).toBe(400);
    });
});
