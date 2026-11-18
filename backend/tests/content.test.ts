import { beforeAll, describe, expect, it } from 'vitest';
import { Contact, TourImage } from '../src/db/models';
import { sentEmails } from '../src/utils/sendEmail';
import { api, createTour, createUser, pngBuffer, uniqueEmail, completeTrip } from './helpers';

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
    admin = await createUser('admin');
});

describe('public catalogue', () => {
    it('lists tours with pagination metadata and cover image URLs', async () => {
        const res = await api().get('/api/tours?page=1&limit=2');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ currentPage: 1, tours: expect.any(Array) });
        expect(res.body.tours.length).toBeLessThanOrEqual(2);
        expect(res.body.tours[0].image).toMatch(/^http:\/\/localhost:3000\/uploads\//);
    });

    it('validates ids and pagination', async () => {
        expect((await api().get('/api/tours/abc')).status).toBe(400);
        expect((await api().get('/api/tours/999999')).status).toBe(404);
        expect((await api().get('/api/tours?limit=0')).status).toBe(400);
        expect((await api().get('/api/destinations?limit=101')).status).toBe(400);
    });

    it('search requires a query and treats % literally', async () => {
        expect((await api().get('/api/search')).status).toBe(400);
        const all = await api().get('/api/search?query=%25');
        expect(all.status).toBe(200);
        expect(all.body.tours).toHaveLength(0);
        const hit = await api().get('/api/search?query=australia&limit=2');
        expect(hit.body.destinations.length).toBeGreaterThan(0);
    });

    it('serves JSON 404s for unknown routes', async () => {
        const res = await api().get('/api/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.message).toBeDefined();
    });

    it('sends security headers and hides X-Powered-By', async () => {
        const res = await api().get('/api/categories/1');
        expect(res.headers['x-powered-by']).toBeUndefined();
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
});

describe('uploads', () => {
    it('accepts real images and rejects files that only claim to be images', async () => {
        const ok = await api()
            .post('/api/destinations')
            .set(admin.auth)
            .field('name', 'Test Land')
            .attach('images', await pngBuffer(), { filename: 'a.png', contentType: 'image/png' });
        expect(ok.status).toBe(201);
        expect(ok.body.image).toMatch(/^Test_Land\/Test_Land_.+\.webp$/);

        const fake = await api()
            .post('/api/destinations')
            .set(admin.auth)
            .field('name', 'Fake Land')
            .attach('images', Buffer.from('not really a png'), { filename: 'a.png', contentType: 'image/png' });
        expect(fake.status).toBe(400);

        const wrongType = await api()
            .post('/api/destinations')
            .set(admin.auth)
            .field('name', 'Pdf Land')
            .attach('images', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
        expect(wrongType.status).toBe(400);
    });

    it('cover image must belong to the tour (S-12)', async () => {
        const a = await createTour(admin.auth);
        const b = await createTour(admin.auth);
        const imageOfB = await TourImage.findOne({ where: { tour_id: b.tour_id } });

        const res = await api().patch('/api/tours/cover').set(admin.auth).send({ tour_id: a.tour_id, image_id: imageOfB!.image_id });
        expect(res.status).toBe(404);
        expect(await TourImage.count({ where: { tour_id: b.tour_id, is_cover: true } })).toBe(1);
    });

    it('rejects tours whose end date is before the start date', async () => {
        const res = await api()
            .put('/api/tours/2')
            .set(admin.auth)
            .send({ name: 'x', price: 10, available_spots: 1, start_date: '2030-01-10', end_date: '2030-01-01' });
        expect(res.status).toBe(400);
    });
});

describe('reviews and favourites', () => {
    it('validates rating, prevents duplicates and lets owners delete their own review', async () => {
        const tour = await createTour(admin.auth);
        const author = await createUser();
        const other = await createUser();
        await completeTrip(admin.auth, author.auth, tour.tour_id);

        expect((await api().post('/api/review').set(author.auth).send({ tour_id: tour.tour_id, rating: 6 })).status).toBe(400);

        const created = await api().post('/api/review').set(author.auth).send({ tour_id: tour.tour_id, rating: 5, comment: 'Great' });
        expect(created.status).toBe(201);
        expect((await api().post('/api/review').set(author.auth).send({ tour_id: tour.tour_id, rating: 4 })).status).toBe(409);

        const detail = await api().get(`/api/tours/${tour.tour_id}`).set(author.auth);
        expect(detail.body.hasReviewed).toBe(true);

        expect((await api().delete(`/api/review/${created.body.review_id}`).set(other.auth)).status).toBe(403);
        expect((await api().delete(`/api/review/${created.body.review_id}`).set(author.auth)).status).toBe(200);
    });

    it('favourites: add, duplicate 409, check, remove', async () => {
        const tour = await createTour(admin.auth);
        const user = await createUser();
        expect((await api().post('/api/favorite').set(user.auth).send({ tour_id: tour.tour_id })).status).toBe(201);
        expect((await api().post('/api/favorite').set(user.auth).send({ tour_id: tour.tour_id })).status).toBe(409);
        expect((await api().get(`/api/favorite/check/${tour.tour_id}`).set(user.auth)).body).toEqual({ inFavorites: true });
        expect((await api().get(`/api/favorite/check/${tour.tour_id}`)).body).toEqual({ inFavorites: false });
        expect((await api().delete(`/api/favorite/${tour.tour_id}`).set(user.auth)).status).toBe(200);
    });
});

describe('contact form', () => {
    it('stores the message and HTML-escapes it in the notification (S-07)', async () => {
        const payload = {
            full_name: '<script>alert(1)</script>',
            email: uniqueEmail('contact'),
            phone_number: '+1 555 0100',
            message: '<a href="https://evil.example">click</a>',
        };
        const res = await api().post('/api/contact').send(payload);
        expect(res.status).toBe(200);

        expect(await Contact.findOne({ where: { email: payload.email } })).not.toBeNull();
        const mail = sentEmails.findLast((m) => m.subject === 'New Customer Message');
        expect(mail!.to).toBe('inbox@wanderluxe.test');
        expect(mail!.html).not.toContain('<script>');
        expect(mail!.html).toContain('&lt;script&gt;');
        expect(mail!.html).not.toContain('<a href="https://evil.example">');
    });

    it('admin stats work now that the contacts table exists (D-02)', async () => {
        const res = await api().get('/api/stats').set(admin.auth);
        expect(res.status).toBe(200);
        expect(res.body.metrics.unreadMessages).toBeGreaterThan(0);
    });
});

describe('newsletter', () => {
    it('confirms a subscription once via the e-mailed token', async () => {
        const email = uniqueEmail('news');
        await api().post('/api/newsletter/subscribe').send({ email }).expect(200);
        const mail = sentEmails.findLast((m) => m.to === email);
        const token = /token=([\w-]+)/.exec(mail!.html)![1];

        expect((await api().get(`/api/newsletter/verify?token=${token}`)).status).toBe(200);
        expect((await api().get(`/api/newsletter/verify?token=${token}`)).status).toBe(404);
        expect((await api().post('/api/newsletter/subscribe').send({ email })).status).toBe(400);
    });
});
