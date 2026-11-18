import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Booking, Tour, User } from '../src/db/models';
import { logger } from '../src/lib/logger';
import { sentEmails } from '../src/utils';
import { api, createTour, createUser } from './helpers';

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
    admin = await createUser('admin');
});

afterEach(() => {
    vi.restoreAllMocks();
});

const mailsTo = (email: string) => sentEmails.filter((m) => m.to === email);

/** Booking e-mails are sent after the response, so wait for them. */
const waitForMail = (email: string, subject: RegExp) =>
    vi.waitFor(
        () => {
            const mail = mailsTo(email).find((m) => subject.test(m.subject));
            if (!mail) throw new Error(`no "${subject}" e-mail to ${email}`);
            return mail;
        },
        { timeout: 5_000, interval: 25 },
    );

const book = async (customer: Awaited<ReturnType<typeof createUser>>, people = 2) => {
    const tour = await createTour(admin.auth, { spots: 6 });
    const res = await api()
        .post('/api/booking')
        .set(customer.auth)
        .send({ tour_id: tour.tour_id, number_of_people: people });
    expect(res.status).toBe(201);
    return { tour, booking: res.body as { booking_id: number } };
};

describe('booking e-mails', () => {
    it('sends one "booking received" e-mail with the reference, total and link', async () => {
        const customer = await createUser();
        await customer.user.update({ full_name: '<b>Ada</b>' });
        const { booking } = await book(customer, 3);

        const mail = await waitForMail(customer.user.email, /^Booking received/);
        const reference = `WL-${String(booking.booking_id).padStart(6, '0')}`;
        expect(mail.subject).toContain(reference);
        expect(mail.html).toContain(reference);
        expect(mail.html).toContain('$300.30');
        expect(mail.html).toContain(`http://localhost:5173/profile/bookings/${booking.booking_id}`);
        expect(mail.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
        expect(mail.html).not.toContain('<b>Ada</b>');
        expect(mailsTo(customer.user.email)).toHaveLength(1);
    });

    it('tells the customer when a booking is confirmed and when the company cancels it', async () => {
        const customer = await createUser();
        const { booking } = await book(customer);
        await api()
            .patch(`/api/booking/${booking.booking_id}/status`)
            .set(admin.auth)
            .send({ status: 'confirmed' })
            .expect(200);
        await waitForMail(customer.user.email, /^Booking confirmed/);

        await api()
            .patch(`/api/booking/${booking.booking_id}/status`)
            .set(admin.auth)
            .send({ status: 'cancelled', note: 'Storm <warning>' })
            .expect(200);
        const mail = await waitForMail(customer.user.email, /^Booking cancelled/);
        expect(mail.html).toContain('we had to cancel');
        expect(mail.html).toContain('Storm &lt;warning&gt;');
    });

    it('confirms a cancellation the customer made themself', async () => {
        const customer = await createUser();
        const { booking } = await book(customer);
        await api().patch(`/api/booking/${booking.booking_id}/cancel`).set(customer.auth).expect(200);
        const mail = await waitForMail(customer.user.email, /^Booking cancelled/);
        expect(mail.html).toContain('As you asked');
    });

    it('asks for a review when a finished tour completes the booking', async () => {
        const customer = await createUser();
        const { booking, tour } = await book(customer);
        await api()
            .patch(`/api/booking/${booking.booking_id}/status`)
            .set(admin.auth)
            .send({ status: 'confirmed' })
            .expect(200);
        await Tour.update(
            { start_date: new Date(Date.now() - 8 * 86_400_000), end_date: new Date(Date.now() - 86_400_000) },
            { where: { tour_id: tour.tour_id } },
        );
        await api().get('/api/booking/my?view=past').set(customer.auth).expect(200);

        const mail = await waitForMail(customer.user.email, /^How was your trip\?/);
        expect(mail.html).toContain(`http://localhost:5173/tours/${tour.tour_id}`);
    });

    it('sends nothing to example.com addresses (demo accounts)', async () => {
        const customer = await createUser();
        const email = `demo-${Date.now()}@example.com`;
        await User.update({ email }, { where: { user_id: customer.user.user_id } });
        await book(customer);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(mailsTo(email)).toHaveLength(0);
    });

    it('a failing e-mail never fails the booking', async () => {
        const warn = vi.spyOn(logger, 'warn');
        // The notification loads the booking again; make that fail.
        vi.spyOn(Booking, 'findByPk').mockRejectedValueOnce(new Error('SMTP down'));
        const customer = await createUser();
        const { booking } = await book(customer);

        await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Booking e-mail failed', expect.anything()));
        expect(await Booking.findByPk(booking.booking_id)).not.toBeNull();
        expect(mailsTo(customer.user.email)).toHaveLength(0);
    });
});
