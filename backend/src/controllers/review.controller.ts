import { Response } from 'express';
import { AuthenticatedRequest, IPaginationQuery, TypedRequest } from '../types';
import { Review, User, Tour, sequelize } from '../db/models';
import { AppError, ForbiddenError, NotFoundError, getPagination, totalPages } from '../utils';
import { NOT_TRAVELLED_MESSAGE, getReviewEligibility, visibleReviewsWhere } from '../lib/reviews';

// --- Types ---
type CreateReviewBody = {
    tour_id: number;
    rating: number;
    comment?: string;
};

type TourIdParam = {
    tour_id: number;
};

type ReviewIdParam = {
    review_id: number;
};

export const createReview = async (
    req: AuthenticatedRequest<{}, {}, CreateReviewBody>,
    res: Response
): Promise<void> => {
    const user_id = req.user_id!;
    const { tour_id, rating, comment } = req.body;

    const tour = await Tour.findByPk(tour_id, { attributes: ['tour_id'] });
    if (!tour) {
        throw new NotFoundError('Tour not found');
    }

    const eligibility = await getReviewEligibility(user_id, tour_id);
    if (eligibility.reason === 'already_reviewed') {
        throw new AppError(409, 'You have already reviewed this tour');
    }
    if (!eligibility.canReview) {
        throw new ForbiddenError(NOT_TRAVELLED_MESSAGE);
    }

    const review = await Review.create({
        user_id,
        tour_id,
        rating,
        comment,
    });

    res.status(201).json(review);
};

export const getAllReviews = async (
    req: TypedRequest<{}, {}, {}, IPaginationQuery>,
    res: Response
): Promise<void> => {
    const { page, limit, offset } = getPagination(req.query, 4);

    const { count, rows } = await Review.findAndCountAll({
        where: await visibleReviewsWhere(),
        include: [
            {
                model: User,
                attributes: ['user_id', 'full_name'],
            },
            {
                model: Tour,
                attributes: ['name'],
            },
        ],
        order: sequelize.random(),
        limit,
        offset,
    });

    const reviews = rows.map((reviewItem) => {
        const review = reviewItem.toJSON();
        return {
            ...review,
            full_name: review.User?.full_name,
            tour_name: review.Tour?.name,
            User: undefined,
            Tour: undefined,
        };
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        reviews,
    });
};

export const getReviewsForTour = async (
    req: AuthenticatedRequest<TourIdParam, {}, {}, IPaginationQuery>,
    res: Response
): Promise<void> => {
    const tour_id = req.params.tour_id;

    const { page, limit, offset } = getPagination(req.query, 4);

    const { count, rows } = await Review.findAndCountAll({
        where: { ...(await visibleReviewsWhere(req.user_id)), tour_id },
        include: [
            {
                model: User,
                attributes: ['user_id', 'full_name'],
            },
            {
                model: Tour,
                attributes: ['name'],
            },
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset,
    });

    const reviews = rows.map((reviewItem) => {
        const review = reviewItem.toJSON();
        return {
            ...review,
            full_name: review.User?.full_name,
            tour_name: review.Tour?.name,
            User: undefined,
            Tour: undefined,
        };
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        reviews,
    });
};

/** Admins may delete any review; customers only their own (as the profile UI offers). */
export const deleteReview = async (
    req: AuthenticatedRequest<ReviewIdParam>,
    res: Response
): Promise<void> => {
    const review = await Review.findByPk(req.params.review_id);

    if (!review) {
        throw new NotFoundError('Review not found');
    }
    if (req.user_role !== 'admin' && review.user_id !== req.user_id) {
        throw new ForbiddenError('You can only delete your own reviews.');
    }

    await review.destroy();

    res.status(200).json({ message: 'Review deleted successfully' });
};

export const getUserReviews = async (
    req: AuthenticatedRequest<{}, {}, {}, IPaginationQuery>,
    res: Response
): Promise<void> => {
    const user_id = req.user_id;

    const { page, limit, offset } = getPagination(req.query, 10);

    const { count, rows } = await Review.findAndCountAll({
        where: { user_id },
        include: [
            {
                model: Tour,
                attributes: ['tour_id', 'name'],
            },
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset,
    });

    const reviews = rows.map((reviewItem) => {
        const review = reviewItem.toJSON();
        return {
            ...review,
            tour_name: review.Tour?.name,
            Tour: undefined,
        };
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        reviews,
    });
};

/** Whether the signed-in user may review this tour, and why not. */
export const getEligibility = async (req: AuthenticatedRequest<TourIdParam>, res: Response): Promise<void> => {
    const tour = await Tour.findByPk(req.params.tour_id, { attributes: ['tour_id'] });
    if (!tour) {
        throw new NotFoundError('Tour not found');
    }
    res.status(200).json(await getReviewEligibility(req.user_id!, tour.tour_id));
};
