import express from 'express';
import { verifyToken, isAdmin, optionalAuth } from '../middlewares/auth.middleware';
import { createTour, getFilteredTours, getTourById, updateTour, deleteTour } from '../controllers/tour.controller';
import { addImagesToTour, getImagesForTour, deleteImageForTour, setCoverImage } from '../controllers/tourImage.controller';
import { upload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const tourId = validate({ params: v.idParam('id') });
const imageTourId = validate({ params: v.idParam('tour_id') });

// Tour Routes
router.get('/', validate({ query: v.tourListQuery }), asHandler(getFilteredTours));
// `/cover` must be declared before `/:id`-style routes that could shadow it
router.patch('/cover', verifyToken, isAdmin, validate({ body: v.coverImageBody }), asHandler(setCoverImage));
router.get('/:id', optionalAuth, validate({ params: v.idParam('id'), query: v.tourByIdQuery }), asHandler(getTourById));
router.post('/', verifyToken, isAdmin, upload, validate({ body: v.tourBody }), asHandler(createTour));
router.put('/:id', verifyToken, isAdmin, validate({ params: v.idParam('id'), body: v.tourBody }), asHandler(updateTour));
router.delete('/:id', verifyToken, isAdmin, tourId, asHandler(deleteTour));

// Tour Image Routes
router.post('/:tour_id/images', verifyToken, isAdmin, upload, imageTourId, asHandler(addImagesToTour));
router.get('/:tour_id/images', imageTourId, asHandler(getImagesForTour));
router.delete(
    '/:tour_id/images/:image_id',
    verifyToken,
    isAdmin,
    validate({ params: v.tourImageParams }),
    asHandler(deleteImageForTour),
);

export default router;
