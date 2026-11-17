import type { Response } from 'express';
import { TOURS_BUCKET } from '../constants';
import { Tour, TourImage, sequelize } from '../db/models';
import { removeQuietly } from '../lib/storage';
import type { AuthenticatedRequest, TypedRequest } from '../types';
import { BadRequestError, NotFoundError, uploadAndProcessImages } from '../utils';

const MAX_IMAGES_PER_TOUR = 10;

interface TourIdParam {
    tour_id: number;
}

interface TourImageIds {
    tour_id: number;
    image_id: number;
}

// Add images (Admin)
export const addImagesToTour = async (req: AuthenticatedRequest<TourIdParam>, res: Response): Promise<void> => {
    const { tour_id } = req.params;
    const files = req.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
        throw new BadRequestError('No files uploaded');
    }

    const tour = await Tour.findByPk(tour_id);
    if (!tour) {
        throw new NotFoundError('Tour not found.');
    }

    const existingImageCount = await TourImage.count({ where: { tour_id } });
    if (existingImageCount + files.length > MAX_IMAGES_PER_TOUR) {
        throw new BadRequestError(`A tour can have a maximum of ${MAX_IMAGES_PER_TOUR} images.`);
    }

    const imagePaths = await uploadAndProcessImages(files, TOURS_BUCKET, tour_id);

    try {
        const newImages = await TourImage.bulkCreate(
            imagePaths.map((path, index) => ({
                tour_id,
                image_url: path,
                // A tour that had no images gets its first upload as cover.
                is_cover: existingImageCount === 0 && index === 0,
            })),
        );
        res.status(201).json(newImages);
    } catch (err) {
        await removeQuietly(TOURS_BUCKET, imagePaths);
        throw err;
    }
};

// Get images (Public)
export const getImagesForTour = async (req: TypedRequest<TourIdParam>, res: Response): Promise<void> => {
    const images = await TourImage.findAll({ where: { tour_id: req.params.tour_id }, order: [['image_id', 'ASC']] });
    res.json(images);
};

// Set cover (Admin)
export const setCoverImage = async (
    req: AuthenticatedRequest<{}, {}, TourImageIds>,
    res: Response,
): Promise<void> => {
    const { tour_id, image_id } = req.body;

    await sequelize.transaction(async (transaction) => {
        const image = await TourImage.findOne({ where: { image_id, tour_id }, transaction });
        if (!image) {
            throw new NotFoundError('Image not found for this tour.');
        }
        await TourImage.update({ is_cover: false }, { where: { tour_id }, transaction });
        await image.update({ is_cover: true }, { transaction });
    });

    res.json({ message: 'Cover image updated.' });
};

// Delete image (Admin)
export const deleteImageForTour = async (req: TypedRequest<TourImageIds>, res: Response): Promise<void> => {
    const { tour_id, image_id } = req.params;

    const imageKey = await sequelize.transaction(async (transaction) => {
        const image = await TourImage.findOne({ where: { tour_id, image_id }, transaction });
        if (!image) {
            throw new NotFoundError('Image not found.');
        }

        const imageCount = await TourImage.count({ where: { tour_id }, transaction });
        if (imageCount <= 1) {
            throw new BadRequestError('At least one image must remain for this tour.');
        }

        const wasCover = image.is_cover;
        await image.destroy({ transaction });

        // If the deleted image was the cover, promote the oldest remaining one.
        if (wasCover) {
            const otherImage = await TourImage.findOne({
                where: { tour_id },
                order: [['image_id', 'ASC']],
                transaction,
            });
            await otherImage?.update({ is_cover: true }, { transaction });
        }
        return image.image_url;
    });

    await removeQuietly(TOURS_BUCKET, [imageKey]);
    res.json({ message: 'Image deleted successfully.' });
};
