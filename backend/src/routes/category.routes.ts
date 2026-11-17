import express from 'express';
import {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
} from '../controllers/category.controller';
import { isAdmin, verifyToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();
const categoryId = validate({ params: v.idParam('id') });

router.post('/', verifyToken, isAdmin, validate({ body: v.categoryBody }), asHandler(createCategory));
router.get('/', verifyToken, isAdmin, asHandler(getAllCategories));
router.get('/:id', categoryId, asHandler(getCategoryById));
router.put('/:id', verifyToken, isAdmin, validate({ params: v.idParam('id'), body: v.categoryBody }), asHandler(updateCategory));
router.delete('/:id', verifyToken, isAdmin, categoryId, asHandler(deleteCategory));

export default router;
