/**
 * Booking lifecycle helpers shared by the booking controller and the demo clean-up.
 *
 * A booking is never deleted when it is cancelled: it keeps its row with
 * status 'cancelled', who cancelled it, when and why, and its seats go back on sale.
 */
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { Booking, Tour } from '../db/models';
import type { BookingStatus } from '../db/models/booking.model';
import { ConflictError } from '../utils';

/** Statuses that still hold seats on the tour. */
export const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

/** How "My Bookings" splits a customer's bookings. */
export type BookingView = 'upcoming' | 'past' | 'cancelled';

export const bookingViewWhere = (view: BookingView, now = new Date()): WhereOptions => {
    switch (view) {
        case 'cancelled':
            return { status: 'cancelled' };
        case 'past':
            return {
                [Op.or]: [
                    { status: { [Op.in]: ['completed', 'no_show', 'refunded'] } },
                    { status: { [Op.in]: ACTIVE_STATUSES }, '$Tour.end_date$': { [Op.lt]: now } },
                ],
            };
        case 'upcoming':
        default:
            return { status: { [Op.in]: ACTIVE_STATUSES }, '$Tour.end_date$': { [Op.gte]: now } };
    }
};

interface CancelOptions {
    /** The user who cancelled: the customer themself or an admin. */
    actorId: number | null;
    reason?: string | null;
    transaction: Transaction;
}

/**
 * Marks a (row-locked) booking as cancelled and releases its seats exactly once.
 * Cancelling a booking that is not pending/confirmed is a 409, so a double click
 * or a retried request can never give the seats back twice.
 */
export const cancelBookingRow = async (booking: Booking, { actorId, reason, transaction }: CancelOptions) => {
    if (!ACTIVE_STATUSES.includes(booking.status)) {
        throw new ConflictError(
            booking.status === 'cancelled'
                ? 'This booking is already cancelled.'
                : `A ${booking.status.replace('_', '-')} booking can't be cancelled.`,
            { status: booking.status },
        );
    }
    await Tour.increment('available_spots', {
        by: booking.number_of_people,
        where: { tour_id: booking.tour_id },
        transaction,
    });
    booking.status = 'cancelled';
    booking.cancelled_at = new Date();
    booking.cancelled_by = actorId;
    booking.cancellation_reason = reason?.trim() || null;
    await booking.save({ transaction });
    return booking;
};
