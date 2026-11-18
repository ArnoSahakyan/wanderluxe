/**
 * Sends the customer's booking e-mails. Always called after the database
 * transaction has committed, and never awaited by the request: a mail failure
 * is logged and must not fail or roll back the booking.
 */
import { Booking, Tour, User } from '../db/models';
import { type BookingStatusEvent, generateBookingReceivedEmail, generateBookingStatusEmail } from '../emails';
import { isDemoEmail } from '../utils/demoAccounts';
import { sendEmail } from '../utils/sendEmail';
import { logger } from './logger';

export type BookingEmailEvent = 'received' | BookingStatusEvent;

const EMAIL_EVENTS = new Set<string>(['confirmed', 'cancelled', 'completed']);

/** Status changes that send the customer an e-mail. */
export const isEmailedStatus = (status: string): status is BookingStatusEvent => EMAIL_EVENTS.has(status);

/** example.com is reserved (demo accounts live there); mail to it would only bounce. */
const isUndeliverable = (email: string) => isDemoEmail(email) || /@example\.com$/i.test(email);

export const sendBookingEmail = async (booking_id: number, event: BookingEmailEvent): Promise<void> => {
    const booking = await Booking.findByPk(booking_id, {
        include: [
            { model: User, attributes: ['full_name', 'email'] },
            { model: Tour, attributes: ['tour_id', 'name', 'start_date', 'end_date'] },
        ],
    });
    const user = booking?.User;
    const tour = booking?.Tour;
    if (!booking || !user || !tour || isUndeliverable(user.email)) return;

    const data = {
        booking_id: booking.booking_id,
        customer_name: user.full_name,
        tour_id: tour.tour_id,
        tour_name: tour.name,
        start_date: tour.start_date,
        end_date: tour.end_date,
        number_of_people: booking.number_of_people,
        total_price: booking.total_price,
    };
    const { subject, html } =
        event === 'received'
            ? generateBookingReceivedEmail(data)
            : generateBookingStatusEmail({
                  ...data,
                  event,
                  cancelled_by_customer: booking.cancelled_by === booking.user_id,
                  reason: booking.cancellation_reason,
              });
    await sendEmail({ to: user.email, subject, html });
};

/** Fire-and-forget wrapper used by the controllers. */
export const queueBookingEmail = (booking_id: number, event: BookingEmailEvent) => {
    void sendBookingEmail(booking_id, event).catch((err) => {
        logger.warn('Booking e-mail failed', { err, booking_id, event });
    });
};
