import type { Response } from 'express';
import { literal, Op, type OrderItem } from 'sequelize';
import type { z } from 'zod';
import { CANCELLATION_MIN_DAYS, TOURS_BUCKET } from '../constants';
import { Booking, Category, Destination, Tour, TourImage, User, sequelize } from '../db/models';
import { type BookingView, bookingViewWhere, cancelBookingRow } from '../lib/bookings';
import type { AuthenticatedRequest, TypedRequest } from '../types';
import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    getPagination,
    toPublicImageUrl,
    totalPages,
} from '../utils';
import type * as v from '../validators';

type BookingIdParams = { booking_id: number };

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Creates a booking and reserves the seats in one transaction. The seat count
 * is decremented with a conditional UPDATE, so two concurrent requests can
 * never oversell a tour (the DB CHECK available_spots >= 0 is the backstop).
 */
export const createBooking = async (
    req: AuthenticatedRequest<{}, {}, z.infer<typeof v.createBookingBody>>,
    res: Response,
) => {
    const user_id = req.user_id!;
    const { tour_id, number_of_people } = req.body;

    const booking = await sequelize.transaction(async (transaction) => {
        const tour = await Tour.findByPk(tour_id, { transaction });
        if (!tour) {
            throw new NotFoundError('Tour not found');
        }
        if (new Date(tour.start_date).getTime() <= Date.now()) {
            throw new BadRequestError('This tour has already started and can no longer be booked.');
        }

        const [affected] = await Tour.update(
            { available_spots: literal(`available_spots - ${Number(number_of_people)}`) as unknown as number },
            { where: { tour_id, available_spots: { [Op.gte]: number_of_people } }, transaction },
        );
        if (affected === 0) {
            throw new BadRequestError('Not enough spots available');
        }

        // numeric(10,2) arrives as a string from pg; compute in cents to avoid float drift.
        const total_price = (Math.round(Number(tour.price) * 100) * number_of_people) / 100;
        return Booking.create({ user_id, tour_id, number_of_people, total_price }, { transaction });
    });

    res.status(201).json(booking);
};

/**
 * Cancels a booking and releases its seats. The row is kept as history with
 * status 'cancelled'. Customers may cancel their own bookings up to
 * CANCELLATION_MIN_DAYS before the start; admins any time.
 */
export const cancelBooking = async (
    req: AuthenticatedRequest<BookingIdParams, {}, z.infer<typeof v.cancelBookingBody>>,
    res: Response,
) => {
    const user_id = req.user_id!;
    const isAdmin = req.user_role === 'admin';

    const booking = await sequelize.transaction(async (transaction) => {
        const booking = await Booking.findByPk(req.params.booking_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!booking) {
            throw new NotFoundError('Booking not found');
        }
        if (booking.user_id !== user_id && !isAdmin) {
            throw new ForbiddenError('Unauthorized');
        }

        const tour = await Tour.findByPk(booking.tour_id, { transaction });
        if (!tour) {
            throw new NotFoundError('Associated tour not found');
        }

        const daysUntilStart = (new Date(tour.start_date).getTime() - Date.now()) / DAY_MS;
        if (!isAdmin && booking.status !== 'cancelled' && daysUntilStart < CANCELLATION_MIN_DAYS) {
            throw new BadRequestError(
                `Bookings can only be cancelled at least ${CANCELLATION_MIN_DAYS} days before the tour starts.`,
            );
        }

        return cancelBookingRow(booking, { actorId: user_id, reason: req.body?.reason, transaction });
    });

    res.status(200).json({ message: 'Booking cancelled successfully', booking });
};

const coverImageUrl = (tour?: Tour) => {
    const cover = tour?.TourImages?.find((img) => img.is_cover);
    return cover ? toPublicImageUrl(cover.image_url, TOURS_BUCKET) : null;
};

const VIEW_ORDER: Record<BookingView, OrderItem[]> = {
    upcoming: [[Tour, 'start_date', 'ASC']],
    past: [[Tour, 'start_date', 'DESC']],
    cancelled: [['cancelled_at', 'DESC']],
};

/** Cancellation details as the customer and admin pages show them. */
const cancellationInfo = (booking: Booking) =>
    booking.status === 'cancelled'
        ? {
              cancelled_at: booking.cancelled_at,
              cancellation_reason: booking.cancellation_reason,
              cancelled_by_customer: booking.cancelled_by === booking.user_id,
          }
        : {};

export const getUsersBookings = async (
    req: AuthenticatedRequest<{}, {}, {}, z.infer<typeof v.myBookingsQuery>>,
    res: Response,
) => {
    const { page, limit, offset } = getPagination(req.query);
    const view: BookingView = req.query.view ?? 'upcoming';

    const { count, rows } = await Booking.findAndCountAll({
        where: { user_id: req.user_id, ...bookingViewWhere(view) },
        include: [
            {
                model: Tour,
                required: true,
                include: [
                    { model: Destination, attributes: ['name'] },
                    { model: Category, attributes: ['name'] },
                    { model: TourImage, where: { is_cover: true }, required: false, attributes: ['image_url', 'is_cover'] },
                ],
            },
        ],
        order: [...VIEW_ORDER[view], ['booking_id', 'DESC']],
        limit,
        offset,
        distinct: true,
        // The view filters on the tour's dates; a tour has at most one cover image,
        // so a flat join paginates correctly.
        subQuery: false,
    });

    const bookings = rows.map((booking) => {
        const tour = booking.Tour;
        return {
            booking_id: booking.booking_id,
            booking_date: booking.booking_date,
            number_of_people: booking.number_of_people,
            total_price: booking.total_price,
            status: booking.status,
            ...cancellationInfo(booking),
            tour_id: tour?.tour_id,
            tour_name: tour?.name,
            start_date: tour?.start_date,
            end_date: tour?.end_date,
            destination_name: tour?.Destination?.name || null,
            category_name: tour?.Category?.name || null,
            image: coverImageUrl(tour),
        };
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        bookings,
    });
};

export const getBookingById = async (req: AuthenticatedRequest<BookingIdParams>, res: Response) => {
    const booking = await Booking.findByPk(req.params.booking_id, {
        include: [
            {
                model: Tour,
                include: [Destination, Category, TourImage],
            },
            {
                model: User,
                attributes: ['user_id', 'full_name', 'email'],
            },
        ],
    });

    if (!booking) {
        throw new NotFoundError('Booking not found');
    }

    // Authorization is based on the *requester* (from the verified token).
    const isOwner = booking.user_id === req.user_id;
    const isAdmin = req.user_role === 'admin';

    if (!isOwner && !isAdmin) {
        throw new ForbiddenError('Unauthorized');
    }

    const tour = booking.Tour;

    res.status(200).json({
        booking_id: booking.booking_id,
        booking_date: booking.booking_date,
        number_of_people: booking.number_of_people,
        total_price: booking.total_price,
        status: booking.status,
        ...cancellationInfo(booking),
        tour_id: tour?.tour_id,
        tour_name: tour?.name,
        start_date: tour?.start_date,
        end_date: tour?.end_date,
        destination_name: tour?.Destination?.name || null,
        category_name: tour?.Category?.name || null,
        image: coverImageUrl(tour),
        user: isAdmin
            ? {
                  user_id: booking.User?.user_id,
                  full_name: booking.User?.full_name,
                  email: booking.User?.email,
              }
            : undefined,
    });
};

export const getAllBookings = async (
    req: TypedRequest<{}, {}, {}, z.infer<typeof v.adminBookingsQuery>>,
    res: Response,
) => {
    const { page, limit, offset } = getPagination(req.query);
    const { status } = req.query;

    const { count, rows } = await Booking.findAndCountAll({
        where: status ? { status } : {},
        include: [
            {
                model: Tour,
                include: ['Destination', 'Category'],
            },
            {
                model: User,
                attributes: ['user_id', 'full_name', 'email'],
            },
            {
                model: User,
                as: 'CancelledBy',
                attributes: ['user_id', 'full_name'],
            },
        ],
        order: [['booking_date', 'DESC']],
        limit,
        offset,
        distinct: true,
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        bookings: rows,
    });
};

export const confirmBooking = async (req: AuthenticatedRequest<BookingIdParams>, res: Response) => {
    const booking = await Booking.findByPk(req.params.booking_id);
    if (!booking) {
        throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
        throw new BadRequestError('Only pending bookings can be confirmed');
    }

    booking.status = 'confirmed';
    await booking.save();

    res.status(200).json({ message: 'Booking confirmed successfully', booking });
};
