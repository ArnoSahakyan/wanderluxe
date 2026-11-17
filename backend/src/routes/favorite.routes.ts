import express from 'express';
import { optionalAuth, verifyToken } from '../middlewares/auth.middleware';
import { addToFavorites, checkFavorite, getUserFavorites, removeFromFavorites } from '../controllers/favorite.controller';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const tourId = validate({ params: v.idParam('tour_id') });

router.get('/', verifyToken, validate({ query: v.pagination }), asHandler(getUserFavorites));
router.post('/', verifyToken, validate({ body: v.favoriteBody }), asHandler(addToFavorites));
router.get('/check/:tour_id', optionalAuth, tourId, asHandler(checkFavorite));
router.delete('/:tour_id', verifyToken, tourId, asHandler(removeFromFavorites));

export default router;
