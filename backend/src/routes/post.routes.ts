import express from 'express';
import { createPost, deletePost, getAllPosts, getPostBySlug, updatePost } from '../controllers/post.controller';
import { isAdmin, optionalAuth, verifyToken } from '../middlewares/auth.middleware';
import { upload } from '../middlewares/upload.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asHandler } from '../utils';
import * as v from '../validators';

const router = express.Router();

router.get('/', optionalAuth, validate({ query: v.searchablePagination }), asHandler(getAllPosts));
router.get('/:slug', optionalAuth, validate({ params: v.slugParam }), asHandler(getPostBySlug));

router.post('/', verifyToken, isAdmin, upload, validate({ body: v.createPostBody }), asHandler(createPost));
router.put(
    '/:slug',
    verifyToken,
    isAdmin,
    upload,
    validate({ params: v.slugParam, body: v.updatePostBody }),
    asHandler(updatePost),
);
router.delete('/:id', verifyToken, isAdmin, validate({ params: v.idParam('id') }), asHandler(deletePost));

export default router;
