import type { Response } from 'express';
import { Op, type WhereOptions } from 'sequelize';
import type { z } from 'zod';
import { BLOGS_BUCKET } from '../constants';
import { Post } from '../db/models';
import { removeQuietly } from '../lib/storage';
import type { AuthenticatedRequest } from '../types';
import {
    AppError,
    NotFoundError,
    containsPattern,
    generateSlug,
    generateUniqueSlug,
    getPagination,
    toImageUrls,
    totalPages,
    uploadAndProcessImages,
} from '../utils';
import type * as v from '../validators';

interface PostParams {
    id: number;
}
interface SlugParams {
    slug: string;
}

const withImageUrl = (post: Post) => {
    const raw = post.get({ plain: true });
    return { ...raw, ...toImageUrls(raw.image, BLOGS_BUCKET) };
};

// --- GET /blog?page=&limit=&search= ---
export const getAllPosts = async (
    req: AuthenticatedRequest<{}, {}, {}, z.infer<typeof v.searchablePagination>>,
    res: Response,
): Promise<void> => {
    const { search } = req.query;
    const { page, limit, offset } = getPagination(req.query);

    const baseCondition: WhereOptions = {};
    if (req.user_role !== 'admin') {
        // guests & customers → only published
        baseCondition.is_published = true;
    }

    const whereCondition: WhereOptions = search
        ? {
              [Op.and]: [
                  baseCondition,
                  {
                      [Op.or]: [
                          { title: { [Op.iLike]: containsPattern(search) } },
                          { excerpt: { [Op.iLike]: containsPattern(search) } },
                      ],
                  },
              ],
          }
        : baseCondition;

    const { count, rows } = await Post.findAndCountAll({
        limit,
        offset,
        where: whereCondition,
        order: [['created_at', 'DESC']],
        attributes: { exclude: ['content'] },
    });

    res.json({
        total: count,
        currentPage: page,
        totalPages: totalPages(count, limit),
        posts: rows.map(withImageUrl),
    });
};

// --- GET /blog/:slug ---
export const getPostBySlug = async (req: AuthenticatedRequest<SlugParams>, res: Response): Promise<void> => {
    const whereCondition: WhereOptions = { slug: req.params.slug };
    if (req.user_role !== 'admin') {
        whereCondition.is_published = true;
    }

    const post = await Post.findOne({ where: whereCondition });
    if (!post) {
        throw new NotFoundError('Post not found');
    }

    res.json(withImageUrl(post));
};

// --- POST /blog ---
export const createPost = async (
    req: AuthenticatedRequest<{}, {}, z.infer<typeof v.createPostBody>>,
    res: Response,
): Promise<void> => {
    const { title, slug, excerpt, content, is_published } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    // A requested slug is normalised; collisions are a 409, auto slugs get a suffix.
    let finalSlug: string;
    if (slug) {
        finalSlug = generateSlug(slug);
        if (await Post.findOne({ where: { slug: finalSlug } })) {
            throw new AppError(409, 'A post with this slug already exists.');
        }
    } else {
        finalSlug = await generateUniqueSlug(title);
    }

    let coverImagePath: string | undefined;
    if (files && files.length > 0) {
        [coverImagePath] = await uploadAndProcessImages(files.slice(0, 1), BLOGS_BUCKET, finalSlug);
    }

    try {
        const newPost = await Post.create({
            title,
            slug: finalSlug,
            excerpt,
            content,
            image: coverImagePath,
            is_published: is_published ?? false,
        });
        res.status(201).json(newPost);
    } catch (err) {
        await removeQuietly(BLOGS_BUCKET, [coverImagePath]);
        throw err;
    }
};

// --- PUT /blog/:slug ---
export const updatePost = async (
    req: AuthenticatedRequest<SlugParams, {}, z.infer<typeof v.updatePostBody>>,
    res: Response,
): Promise<void> => {
    const { title, slug, excerpt, content, is_published } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    const post = await Post.findOne({ where: { slug: req.params.slug } });
    if (!post) {
        throw new NotFoundError('Post not found');
    }

    let nextSlug = post.slug;
    if (slug && generateSlug(slug) !== post.slug) {
        nextSlug = generateSlug(slug);
        if (await Post.findOne({ where: { slug: nextSlug, post_id: { [Op.ne]: post.post_id } } })) {
            throw new AppError(409, 'A post with this slug already exists.');
        }
    }

    const previousImage = post.image;
    let coverImagePath = previousImage;
    if (files && files.length > 0) {
        [coverImagePath] = await uploadAndProcessImages(files.slice(0, 1), BLOGS_BUCKET, nextSlug);
    }

    await post.update({
        title: title ?? post.title,
        slug: nextSlug,
        excerpt: excerpt ?? post.excerpt,
        content: content ?? post.content,
        is_published: is_published ?? post.is_published,
        image: coverImagePath,
    });

    if (coverImagePath !== previousImage) {
        await removeQuietly(BLOGS_BUCKET, [previousImage]);
    }

    // Previously re-fetched by the *old* slug, which returned null after a slug change.
    res.json(post);
};

// --- DELETE /blog/:id ---
export const deletePost = async (req: AuthenticatedRequest<PostParams>, res: Response): Promise<void> => {
    const post = await Post.findByPk(req.params.id);
    if (!post) {
        throw new NotFoundError('Post not found');
    }

    const imageKey = post.image;
    await post.destroy();
    await removeQuietly(BLOGS_BUCKET, [imageKey]);

    res.json({ message: 'Post deleted' });
};
