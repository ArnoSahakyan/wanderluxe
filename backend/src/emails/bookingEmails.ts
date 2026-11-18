/**
 * E-mails about a customer's booking: one when it is made, and one when it is
 * confirmed, cancelled or completed. Every user-supplied value is escaped.
 */
import { config } from '../config/env';
import { CANCELLATION_MIN_DAYS } from '../constants';
import { escapeHtml } from '../utils/security';

export interface BookingEmailData {
    booking_id: number;
    customer_name: string;
    tour_id: number;
    tour_name: string;
    start_date: Date | string;
    end_date: Date | string;
    number_of_people: number;
    total_price: number | string;
}

export type BookingStatusEvent = 'confirmed' | 'cancelled' | 'completed';

export interface BookingStatusEmailData extends BookingEmailData {
    event: BookingStatusEvent;
    /** For cancellations: whether the customer cancelled it themself. */
    cancelled_by_customer?: boolean;
    reason?: string | null;
}

/** Short, human-friendly reference shown in e-mails, e.g. WL-000042. */
export const bookingReference = (booking_id: number) => `WL-${String(booking_id).padStart(6, '0')}`;

const day = (value: Date | string) =>
    new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const money = (value: number | string) => Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const bookingLink = (booking_id: number) => `${config.appUrl}/profile/bookings/${booking_id}`;

const layout = (title: string, body: string) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: 'Poppins', Arial, sans-serif; background-color: #F5F7FA; color: #4A5568; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; }
        .header { background-color: #2A7A7B; padding: 28px; text-align: center; }
        .header h1 { color: #FFFFFF; margin: 0; font-size: 22px; }
        .content { padding: 28px; }
        .details { border: 1px solid #CBD5E0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
        .details p { margin: 6px 0; }
        p { line-height: 1.6; }
        .button { display: inline-block; background-color: #2A7A7B; color: #FFFFFF !important; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: bold; }
        .footer { background-color: #2A7A7B; padding: 16px; text-align: center; font-size: 12px; color: #FFFFFF; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${escapeHtml(title)}</h1></div>
        <div class="content">${body}</div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} WanderLuxe. You receive this e-mail because you booked a tour with us.</p>
        </div>
      </div>
    </body>
    </html>
`;

const details = (data: BookingEmailData) => `
    <div class="details">
      <p><strong>Reference:</strong> ${bookingReference(data.booking_id)}</p>
      <p><strong>Tour:</strong> ${escapeHtml(data.tour_name)}</p>
      <p><strong>Dates:</strong> ${day(data.start_date)} – ${day(data.end_date)}</p>
      <p><strong>Guests:</strong> ${data.number_of_people}</p>
      <p><strong>Total:</strong> ${money(data.total_price)}</p>
    </div>`;

export const generateBookingReceivedEmail = (data: BookingEmailData) => ({
    subject: `Booking received: ${data.tour_name} (${bookingReference(data.booking_id)})`,
    html: layout(
        'Booking received',
        `
      <p>Hi ${escapeHtml(data.customer_name)},</p>
      <p>Thank you for booking with WanderLuxe. We have received your booking and will confirm it shortly.</p>
      ${details(data)}
      <p>You can cancel free of charge up to ${CANCELLATION_MIN_DAYS} days before the tour starts.</p>
      <p><a class="button" href="${bookingLink(data.booking_id)}">View your booking</a></p>`,
    ),
});

const STATUS_COPY: Record<BookingStatusEvent, { title: string; subject: string }> = {
    confirmed: { title: 'Your booking is confirmed', subject: 'Booking confirmed' },
    cancelled: { title: 'Your booking was cancelled', subject: 'Booking cancelled' },
    completed: { title: 'Thanks for travelling with us', subject: 'How was your trip?' },
};

export const generateBookingStatusEmail = (data: BookingStatusEmailData) => {
    const copy = STATUS_COPY[data.event];
    let message: string;
    switch (data.event) {
        case 'confirmed':
            message = '<p>Good news: your place on this tour is confirmed. We look forward to travelling with you.</p>';
            break;
        case 'cancelled':
            message = `<p>${
                data.cancelled_by_customer
                    ? 'As you asked, we have cancelled your booking.'
                    : 'We are sorry to tell you that we had to cancel your booking.'
            }</p>${data.reason ? `<p><strong>Reason:</strong> ${escapeHtml(data.reason)}</p>` : ''}`;
            break;
        case 'completed':
            message = `<p>We hope you enjoyed ${escapeHtml(data.tour_name)}. Other travellers would love to hear about it.</p>
      <p><a class="button" href="${config.appUrl}/tours/${data.tour_id}">Write a review</a></p>`;
            break;
    }
    return {
        subject: `${copy.subject}: ${data.tour_name} (${bookingReference(data.booking_id)})`,
        html: layout(
            copy.title,
            `
      <p>Hi ${escapeHtml(data.customer_name)},</p>
      ${message}
      ${details(data)}
      <p><a href="${bookingLink(data.booking_id)}">View your booking</a></p>`,
        ),
    };
};
