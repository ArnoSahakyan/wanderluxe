import { Response } from 'express';
import { Favorite, Tour, TourImage } from '../db/models';
import { TOURS_BUCKET } from '../constants';
import { toPublicImageUrl, NotFoundError, AppError, getPagination, totalPages } from '../utils';
import { AuthenticatedRequest, IPaginationQuery } from '../types';

// --- Types ---
type TourIdParams = { tour_id: number };

// --- Add a tour to user's favorites ---
export const addToFavorites = async (
    req: AuthenticatedRequest<{}, any, TourIdParams>,
    res: Response
): Promise<void> => {
    const user_id = req.user_id!;
    const { tour_id } = req.body;

    if (!(await Tour.findByPk(tour_id, { attributes: ['tour_id'] }))) {
        throw new NotFoundError('Tour not found');
    }

    const existing = await Favorite.findOne({ where: { user_id, tour_id } });

    if (existing) {
        throw new AppError(409, 'Tour already in favorites');
    }

    const favorite = await Favorite.create({ user_id, tour_id });
    res.status(201).json(favorite);
};

// --- Remove a tour from user's favorites ---
export const removeFromFavorites = async (
    req: AuthenticatedRequest<TourIdParams>,
    res: Response
): Promise<void> => {
    const user_id = req.user_id;
    const { tour_id } = req.params;

    const deleted = await Favorite.destroy({
        where: { user_id, tour_id },
    });

    if (deleted === 0) {
        throw new NotFoundError('Favorite entry not found');
    }

    res.status(200).json({ message: 'Removed from favorites' });
};

// --- Get user's paginated favorites ---
export const getUserFavorites = async (
    req: AuthenticatedRequest<{}, {}, {}, IPaginationQuery>,
    res: Response
): Promise<void> => {
    const user_id = req.user_id;
    const { page, limit, offset } = getPagination(req.query, 10);

    const { count, rows } = await Favorite.findAndCountAll({
        where: { user_id },
        include: [
            {
                model: Tour,
                include: [
                    {
                        model: TourImage,
                        as: 'TourImages',
                        where: { is_cover: true },
                        required: false,
                        attributes: ['image_url'],
                    },
                ],
            },
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset,
        distinct: true,
    });

    const favorites = rows.map((favoriteItem) => {
        const favorite = favoriteItem.toJSON();
        const tour = favorite.Tour;

        return {
            favorite_id: favorite.favorite_id,
            user_id: favorite.user_id,
            created_at: favorite.created_at,
            updated_at: favorite.updated_at,
            tour: {
                tour_id: tour?.tour_id,
                name: tour?.name,
                description: tour?.description,
                price: tour?.price,
                start_date: tour?.start_date,
                end_date: tour?.end_date,
                available_spots: tour?.available_spots,
                image: tour?.TourImages?.[0]?.image_url
                    ? toPublicImageUrl(tour.TourImages[0].image_url, TOURS_BUCKET)
                    : null,
            },
        };
    });

    res.status(200).json({
        total: count,
        page,
        totalPages: totalPages(count, limit),
        favorites,
    });
};

// --- Check if a specific tour is in user's favorites ---
export const checkFavorite = async (
    req: AuthenticatedRequest<TourIdParams, {}, {}, {}>,
    res: Response
): Promise<void> => {
    const { user_id } = req;
    const { tour_id } = req.params;

    if (!user_id) {
        res.status(200).json({ inFavorites: false });
        return;
    }

    const favoriteItem = await Favorite.findOne({
        where: { user_id, tour_id },
    });

    res.status(200).json({ inFavorites: !!favoriteItem });
};
