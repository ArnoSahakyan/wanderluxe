import express from 'express';
import {
    requestNewsletterSubscription,
    verifyNewsletterSubscription,
    unsubscribeNewsletter,
    checkSubscriptionStatus,
    getAllSubscribers,
} from '../controllers/newsletter.controller';
import { isAdmin, verifyToken } from '../middlewares/auth.middleware';
import { formLimiter } from '../middlewares/rateLimit.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();

router.post('/subscribe', formLimiter, validate({ body: v.emailBody }), asHandler(requestNewsletterSubscription));
router.get('/verify', validate({ query: v.tokenQuery }), asHandler(verifyNewsletterSubscription));
router.post('/unsubscribe', verifyToken, validate({ query: v.unsubscribeQuery }), asHandler(unsubscribeNewsletter));
router.get('/is-subscribed', verifyToken, asHandler(checkSubscriptionStatus));
router.get('/all', verifyToken, isAdmin, validate({ query: v.pagination }), asHandler(getAllSubscribers));

export default router;
