import { Request, Response } from 'express';
import { Op, Sequelize, WhereOptions } from 'sequelize';
import { toPublicImageUrl, uploadAndProcessImages, NotFoundError, containsPattern, getPagination, totalPages } from '../utils';
import { removeQuietly } from '../lib/storage';
import { DESTINATIONS_BUCKET } from '../constants';
import { Destination } from '../db/models';
import type { DestinationAttributes } from '../db/models/destination.model';
import { AuthenticatedRequest, IPaginationQuery, TypedRequest } from '../types';

interface DestinationCreateBody {
    name: string;
    description?: string;
}

interface GetFilteredTDestinationsQuery extends IPaginationQuery {
    search?: string;
}

interface DestinationUpdateBody {
    name?: string;
    description?: string;
}

interface DestinationParams {
    id: number;
}

// Create Destination (Admin only)
export const createDestination = async (
    req: AuthenticatedRequest<{}, {}, DestinationCreateBody>,
    res: Response
) => {
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    let imagePath: string | undefined;

    if (files && files.length > 0) {
        const uploaded = await uploadAndProcessImages(files.slice(0, 1), DESTINATIONS_BUCKET, name);
        imagePath = uploaded[0];
    }

    let destination: Destination;
    try {
        destination = await Destination.create({ name, description, image: imagePath });
    } catch (err) {
        await removeQuietly(DESTINATIONS_BUCKET, [imagePath]);
        throw err;
    }

    res.status(201).json(destination);
};

// Update Destination (Admin only)
export const updateDestination = async (
    req: AuthenticatedRequest<DestinationParams, {}, DestinationUpdateBody>,
    res: Response
) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    const destination = await Destination.findByPk(id);

    if (!destination) {
        throw new NotFoundError('Destination not found.');
    }

    const previousImage = destination.image;
    let imagePath = previousImage;

    if (files && files.length > 0) {
        const uploaded = await uploadAndProcessImages(files.slice(0, 1), DESTINATIONS_BUCKET, id);
        imagePath = uploaded[0];
    }

    await destination.update({
        name,
        description,
        image: imagePath,
    });

    // Old file is removed only once the new one is saved and referenced.
    if (imagePath !== previousImage) {
        await removeQuietly(DESTINATIONS_BUCKET, [previousImage]);
    }

    res.json(destination);
};

// Get All Destinations
export const getAllDestinations = async (
    req: TypedRequest<{}, {}, {}, GetFilteredTDestinationsQuery>,
    res: Response
) => {
    const { search } = req.query;
    const { page, limit, offset } = getPagination(req.query);

    const baseCondition: WhereOptions = {};

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

    const { count, rows } = await Destination.findAndCountAll({
        where: whereCondition,
        limit,
        offset,
        attributes: {
            include: [
                [
                    Sequelize.literal(`(
              SELECT COUNT(*)
              FROM "tours" AS "Tour"
              WHERE "Tour"."destination_id" = "Destination"."destination_id"
            )`),
                    'tourCount',
                ],
                [
                    Sequelize.literal(`(
              SELECT MIN("Tour"."price")
              FROM "tours" AS "Tour"
              WHERE "Tour"."destination_id" = "Destination"."destination_id"
            )`),
                    'startingPrice',
                ],
            ],
        },
        order: [['destination_id', 'ASC']],
    });

    const destinations = rows.map(destination => {
        const raw = destination.get({ plain: true }) as DestinationAttributes & { startingPrice?: number | null };
        return {
            ...raw,
            image: raw.image ? toPublicImageUrl(raw.image, DESTINATIONS_BUCKET) : null,
        };
    });

    res.json({
        total: count,
        currentPage: page,
        totalPages: totalPages(count, limit),
        destinations,
    });
};

// Get One
export const getDestinationById = async (
    req: Request<DestinationParams>,
    res: Response
) => {
    const { id } = req.params;

    const destination = await Destination.findByPk(id);

    if (!destination) {
        throw new NotFoundError('Destination not found.');
    }

    const plainDestination = destination.get({ plain: true });

    res.json({
        ...plainDestination,
        image: plainDestination.image ? toPublicImageUrl(plainDestination.image, DESTINATIONS_BUCKET) : null,
    });
};

// Delete
export const deleteDestination = async (
    req: AuthenticatedRequest<DestinationParams>,
    res: Response
) => {
    const { id } = req.params;

    const destination = await Destination.findByPk(id);

    if (!destination) {
        throw new NotFoundError('Destination not found.');
    }

    const imageKey = destination.image;
    await destination.destroy();
    await removeQuietly(DESTINATIONS_BUCKET, [imageKey]);

    res.json({ message: 'Destination deleted successfully.' });
};
