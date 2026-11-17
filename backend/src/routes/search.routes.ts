import { Router } from 'express';
import { globalSearch } from '../controllers/search.controller';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = Router();

router.get('/', validate({ query: v.searchQuery }), asHandler(globalSearch));

export default router;
