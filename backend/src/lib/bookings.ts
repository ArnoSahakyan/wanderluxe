/**
 * Booking lifecycle shared by the booking controller, the stats and the demo clean-up.
 *
 *   pending   → confirmed | cancelled
 *   confirmed → completed | no_show | cancelled
 *   completed → refunded
 *   cancelled, no_show, refunded → final
 *
 * A booking is never deleted when it is cancelled: it keeps its row with
 * status 'cancelled', who cancelled it, when and why, and its seats go back on sale.
 * Every change is recorded in booking_status_history in the same transaction.
 */
import { Op, QueryTypes, type Transaction, type WhereOptions } from 'sequelize';
import { Booking, BookingStatusHistory, Tour, sequelize } from '../db/models';
import type { BookingStatus } from '../db/models/booking.model';
import { ConflictError } from '../utils';
import { queueBookingEmail } from './bookingNotifications';
import { logger } from './logger';

export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'no_show', 'cancelled'],
    completed: ['refunded'],
    cancelled: [],
    no_show: [],
    refunded: [],
};

export const nextStatuses = (status: BookingStatus): readonly BookingStatus[] => TRANSITIONS[status] ?? [];

const label = (status: BookingStatus) => status.replace('_', '-');

export const recordStatusChange = (
    booking_id: number,
    from_status: BookingStatus | null,
    to_status: BookingStatus,
    { actorId, note, transaction }: { actorId: number | null; note?: string | null; transaction?: Transaction },
) =>
    BookingStatusHistory.create(
        { booking_id, from_status, to_status, changed_by: actorId, note: note?.trim() || null },
        { transaction },
    );

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
                : `A ${label(booking.status)} booking can't be cancelled.`,
            { status: booking.status, allowed: nextStatuses(booking.status) },
        );
    }
    const from = booking.status;
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
    await recordStatusChange(booking.booking_id, from, 'cancelled', { actorId, note: reason, transaction });
    return booking;
};

/**
 * Moves a (row-locked) booking to `to`, if the transition table allows it (409
 * with the allowed next states otherwise). Cancelling releases the seats.
 */
export const transitionBooking = async (
    booking: Booking,
    to: BookingStatus,
    { actorId, note, transaction }: { actorId: number | null; note?: string | null; transaction: Transaction },
) => {
    const from = booking.status;
    const allowed = nextStatuses(from);
    if (!allowed.includes(to)) {
        throw new ConflictError(
            from === to
                ? `This booking is already ${label(to)}.`
                : `A ${label(from)} booking can't become ${label(to)}.`,
            { status: from, allowed },
        );
    }
    if (to === 'cancelled') {
        return cancelBookingRow(booking, { actorId, reason: note, transaction });
    }
    booking.status = to;
    await booking.save({ transaction });
    await recordStatusChange(booking.booking_id, from, to, { actorId, note, transaction });
    return booking;
};

/**
 * Marks confirmed bookings whose tour has ended as completed and records it.
 * Render's free plan has no cron, so this runs lazily before bookings and stats
 * are listed. Concurrent runs are safe: each row is updated by exactly one of them.
 * Returns the ids it completed.
 */
export const completeFinishedBookings = async (): Promise<number[]> => {
    try {
        const completed = await sequelize.transaction(async (transaction) => {
            const rows = await sequelize.query<{ booking_id: number }>(
                `UPDATE bookings AS b
                    SET status = 'completed', updated_at = NOW()
                   FROM tours AS t
                  WHERE t.tour_id = b.tour_id
                    AND b.status = 'confirmed'
                    AND t.end_date < NOW()
              RETURNING b.booking_id`,
                { type: QueryTypes.SELECT, transaction },
            );
            if (rows.length) {
                await BookingStatusHistory.bulkCreate(
                    rows.map(({ booking_id }) => ({
                        booking_id,
                        from_status: 'confirmed' as const,
                        to_status: 'completed' as const,
                        changed_by: null,
                        note: 'Tour ended',
                    })),
                    { transaction },
                );
            }
            return rows.map((row) => row.booking_id);
        });
        for (const id of completed) queueBookingEmail(id, 'completed');
        return completed;
    } catch (err) {
        // Never fail a page because of housekeeping.
        logger.warn('Completing finished bookings failed', { err });
        return [];
    }
};
