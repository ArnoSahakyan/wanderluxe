import express from 'express';
import {
    createReview,
    deleteReview,
    getAllReviews,
    getReviewsForTour,
    getEligibility,
    getUserReviews,
} from '../controllers/review.controller';
import { optionalAuth, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();

router.get('/', validate({ query: v.pagination }), asHandler(getAllReviews));
router.post('/', verifyToken, validate({ body: v.createReviewBody }), asHandler(createReview));
router.get('/tour/:tour_id', optionalAuth, validate({ params: v.idParam('tour_id'), query: v.pagination }), asHandler(getReviewsForTour));
router.get('/eligibility/:tour_id', verifyToken, validate({ params: v.idParam('tour_id') }), asHandler(getEligibility));
router.get('/my', verifyToken, validate({ query: v.pagination }), asHandler(getUserReviews));
// Owner or admin (checked in the controller)
router.delete('/:review_id', verifyToken, validate({ params: v.idParam('review_id') }), asHandler(deleteReview));

export default router;
