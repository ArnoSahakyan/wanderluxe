/**
 * Who may review a tour: a customer who has travelled on it, i.e. has a booking
 * for it that is completed, or confirmed with the tour already over (before the
 * automatic completion has run). One review per customer and tour.
 */
import { Op } from 'sequelize';
import { Booking, Review, Tour } from '../db/models';

export type ReviewEligibility =
    { canReview: true; reason: 'eligible' } | { canReview: false; reason: 'already_reviewed' | 'not_travelled' };

export const NOT_TRAVELLED_MESSAGE = 'You can review a tour after you have travelled on it.';

export const getReviewEligibility = async (user_id: number, tour_id: number): Promise<ReviewEligibility> => {
    const [review, booking] = await Promise.all([
        Review.findOne({ where: { user_id, tour_id }, attributes: ['review_id'] }),
        Booking.findOne({
            where: {
                user_id,
                tour_id,
                [Op.or]: [{ status: 'completed' }, { status: 'confirmed', '$Tour.end_date$': { [Op.lt]: new Date() } }],
            },
            include: [{ model: Tour, attributes: [], required: true }],
            attributes: ['booking_id'],
        }),
    ]);
    if (review) return { canReview: false, reason: 'already_reviewed' };
    if (!booking) return { canReview: false, reason: 'not_travelled' };
    return { canReview: true, reason: 'eligible' };
};
