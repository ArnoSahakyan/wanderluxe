import { Response } from 'express';
import {
    Category,
    Destination,
    Review,
    Tour,
    TourImage,
} from '../db/models';
import {
    toImageUrls,
    toPublicImageUrl,
    formatDate,
    uploadAndProcessImages,
    NotFoundError,
    BadRequestError,
    containsPattern,
    getPagination,
    totalPages,
} from '../utils';
import { removeQuietly, toCardKey } from '../lib/storage';
import { sequelize } from '../db/models';
import { TOURS_BUCKET } from '../constants';
import {
    AuthenticatedRequest,
    TypedRequest,
    CreateTourBody,
    UpdateTourBody,
    TourParams,
    GetFilteredToursQuery,
    GetTourByIdParams,
    GetTourByIdQuery,
} from '../types';
import { Op, WhereOptions } from 'sequelize';

// Create Tour (Admin only)
export const createTour = async (
    req: AuthenticatedRequest<{}, {}, CreateTourBody>,
    res: Response
): Promise<void> => {
    const {
        name,
        description,
        price,
        available_spots,
        start_date,
        end_date,
        category_id,
        destination_id,
    } = req.body;
    const files = req.files;

    if (!files || !Array.isArray(files)) {
        throw new BadRequestError('No files uploaded');
    }

    // Images are uploaded after the row exists (their folder is the tour id);
    // if storage fails, the transaction rolls the tour back.
    const tour = await sequelize.transaction(async (transaction) => {
        const created = await Tour.create(
            {
                name,
                description,
                price,
                available_spots,
                start_date: new Date(start_date),
                end_date: new Date(end_date),
                category_id: category_id ?? undefined,
                destination_id: destination_id ?? undefined,
            },
            { transaction },
        );

        if (files.length === 0) return created;
        const imagePaths = await uploadAndProcessImages(files, TOURS_BUCKET, created.tour_id);
        try {
            await TourImage.bulkCreate(
                imagePaths.map((path, index) => ({ tour_id: created.tour_id, image_url: path, is_cover: index === 0 })),
                { transaction },
            );
        } catch (err) {
            await removeQuietly(TOURS_BUCKET, imagePaths);
            throw err;
        }
        return created;
    });

    res.status(201).json(tour);
};

// Get Tours with Optional Filters (Public)
export const getFilteredTours = async (
    req: TypedRequest<{}, {}, {}, GetFilteredToursQuery>,
    res: Response
): Promise<void> => {
    const { category_id, destination_id, search } = req.query;
    const { page, limit, offset } = getPagination(req.query);

    const baseCondition: WhereOptions = {};

    if (category_id) {
        baseCondition.category_id = category_id;
    }

    if (destination_id) {
        baseCondition.destination_id = destination_id;
    }

    const searchCondition: WhereOptions | undefined = search
        ? {
            [Op.or]: [
                { name: { [Op.iLike]: containsPattern(search) } },
                { description: { [Op.iLike]: containsPattern(search) } },
            ],
        }
        : undefined;

    const whereCondition: WhereOptions = searchCondition
        ? { [Op.and]: [baseCondition, searchCondition] }
        : baseCondition;

    const { count, rows } = await Tour.findAndCountAll({
        where: whereCondition,
        limit,
        offset,
        distinct: true,
        order: [['tour_id', 'ASC']],
        include: [
            {
                model: TourImage,
                as: 'TourImages',
                where: { is_cover: true },
                required: false,
                attributes: ['image_url'],
            },
        ],
    });

    const tours = rows.map((tour) => {
        const tourJson = tour.toJSON() as {
            TourImages?: { image_url: string }[];
            [key: string]: unknown;
        };

        const coverImage = tourJson.TourImages?.[0]?.image_url;

        return {
            ...tourJson,
            ...toImageUrls(coverImage, TOURS_BUCKET),
            TourImages: undefined,
        };
    });

    res.json({
        total: count,
        currentPage: page,
        totalPages: totalPages(count, limit),
        tours,
    });
};

// Get a single Tour by ID (Public)
export const getTourById = async (
    req: AuthenticatedRequest<GetTourByIdParams, {}, {}, GetTourByIdQuery>,
    res: Response
): Promise<void> => {
    const id = req.params.id;
    // Prefer the authenticated user; the legacy ?user_id= is only a fallback
    // (it reveals nothing that the public review list does not already show).
    const user_id = req.user_id ?? req.query.user_id;

    const tour = await Tour.findByPk(id, {
        include: [
            { model: TourImage, as: 'TourImages' },
            { model: Destination, as: 'Destination' },
            { model: Category, as: 'Category' },
        ],
    });

    if (!tour) {
        throw new NotFoundError('Tour not found.');
    }

    const plainTour = tour.get({ plain: true });

    const images = plainTour.TourImages?.map((img) => ({
        image_id: img.image_id,
        is_cover: img.is_cover,
        image_url: toPublicImageUrl(img.image_url, TOURS_BUCKET),
        card_url: toPublicImageUrl(toCardKey(img.image_url), TOURS_BUCKET),
    }));

    let hasReviewed = false;
    if (user_id) {
        const existingReview = await Review.findOne({
            where: {
                tour_id: id,
                user_id,
            },
        });
        hasReviewed = !!existingReview;
    }

    res.json({
        tour_id: plainTour.tour_id,
        name: plainTour.name,
        description: plainTour.description,
        price: Number(plainTour.price),
        start_date: formatDate(plainTour.start_date),
        end_date: formatDate(plainTour.end_date),
        available_spots: plainTour.available_spots,
        category_id: plainTour.Category?.category_id ?? null,
        category_name: plainTour.Category?.name ?? null,
        destination_id: plainTour.Destination?.destination_id ?? null,
        destination_name: plainTour.Destination?.name ?? null,
        images,
        hasReviewed,
    });
};

// Update Tour (Admin only)
export const updateTour = async (
    req: AuthenticatedRequest<TourParams, unknown, UpdateTourBody>,
    res: Response
): Promise<void> => {
    const id = req.params.id;
    const {
        name,
        description,
        price,
        available_spots,
        start_date,
        end_date,
        category_id,
        destination_id,
    } = req.body;

    const tour = await Tour.findByPk(id);
    if (!tour) {
        throw new NotFoundError('Tour not found.');
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    await tour.update({
        name,
        description,
        price,
        available_spots,
        start_date: startDate,
        end_date: endDate,
        category_id: category_id ?? undefined,
        destination_id: destination_id ?? undefined,
    });

    res.json(tour);
};

// Delete Tour (Admin only)
export const deleteTour = async (
    req: AuthenticatedRequest<TourParams>,
    res: Response
): Promise<void> => {
    const id = req.params.id;

    const tour = await Tour.findByPk(id, {
        include: [{ model: TourImage, as: 'TourImages' }],
    });

    if (!tour) {
        throw new NotFoundError('Tour not found.');
    }

    const imageKeys = (tour.TourImages ?? []).map((image) => image.image_url);

    // Delete the rows first (images cascade); remove files only after commit,
    // so a storage hiccup can never leave a tour without its images.
    await tour.destroy();
    await removeQuietly(TOURS_BUCKET, imageKeys);

    res.json({ message: 'Tour deleted successfully.' });
};
