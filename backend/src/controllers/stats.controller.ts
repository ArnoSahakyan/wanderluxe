import { Response } from 'express';
import { Op } from 'sequelize';
import { TypedRequest } from '../types';
import { User, Booking, Tour, Destination, Category, Review, Contact } from '../db/models';
import { completeFinishedBookings } from '../lib/bookings';

export const getAdminStats = async (
    req: TypedRequest<{}>,
    res: Response
): Promise<void> => {
    await completeFinishedBookings();
    const [
        totalUsers,
        totalBookings,
        totalTours,
        totalDestinations,
        totalCategories,
        totalReviews,
        unreadMessages,
        revenueResult,
        cancelledLast30Days,
        bookedRevenueResult,
    ] = await Promise.all([
        User.count(),
        Booking.count({ where: { status: { [Op.ne]: 'cancelled' } } }),
        Tour.count(),
        Destination.count(),
        Category.count(),
        Review.count(),
        Contact.count({ where: { status: 'unread' } }),
        Booking.sum('total_price', { where: { status: 'completed' } }),
        Booking.count({
            where: { status: 'cancelled', cancelled_at: { [Op.gte]: new Date(Date.now() - 30 * 86_400_000) } },
        }),
        // Confirmed trips that haven't happened yet: paid, but not earned.
        Booking.sum('total_price', { where: { status: 'confirmed' } }),
    ]);

    const recentBookings = await Booking.findAll({
        limit: 5,
        order: [['booking_date', 'DESC']],
        include: [
            { model: User, attributes: ['full_name', 'email'] },
            { model: Tour, attributes: ['name'] }
        ]
    });

    res.status(200).json({
        metrics: {
            totalUsers,
            totalBookings,
            totalTours,
            totalDestinations,
            totalCategories,
            totalReviews,
            unreadMessages,
            /** Completed trips. */
            totalRevenue: revenueResult || 0,
            /** Confirmed trips still to come. */
            bookedRevenue: bookedRevenueResult || 0,
            cancelledLast30Days,
        },
        recentBookings
    });
};
