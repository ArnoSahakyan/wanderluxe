import { Response } from 'express';
import { Op } from 'sequelize';
import { Destination, Tour, Post } from '../db/models';
import { toPublicImageUrl, containsPattern } from '../utils';
import { DESTINATIONS_BUCKET, TOURS_BUCKET, BLOGS_BUCKET } from '../constants';
import { TourImage } from "../db/models";
import { TypedRequest } from "../types";

interface GetFilteredTPostsQuery {
    limit: number;
    query: string;
}

export const globalSearch = async (req: TypedRequest<{}, {}, {}, GetFilteredTPostsQuery>, res: Response) => {
    const { query, limit } = req.query;
    const pattern = containsPattern(query);

    const [destinations, tours, posts] = await Promise.all([
        Destination.findAll({
            where: {
                [Op.or]: [
                    { name: { [Op.iLike]: pattern } },
                    { description: { [Op.iLike]: pattern } },
                ],
            },
            limit,
        }),
        Tour.findAll({
            where: {
                [Op.or]: [
                    { name: { [Op.iLike]: pattern } },
                    { description: { [Op.iLike]: pattern } },
                ],
            },
            limit,
            include: [
                {
                    model: TourImage,
                    as: 'TourImages',
                    where: { is_cover: true },
                    required: false,
                    attributes: ['image_url'],
                },
            ],
        }),
        Post.findAll({
            where: {
                is_published: true,
                [Op.or]: [
                    { title: { [Op.iLike]: pattern } },
                    { excerpt: { [Op.iLike]: pattern } },
                ],
            },
            limit,
            attributes: ['post_id', 'title', 'slug', 'excerpt', 'image'],
        }),
    ]);

    res.json({
        destinations: destinations.map((d) => ({
            id: d.destination_id,
            name: d.name,
            image: d.image ? toPublicImageUrl(d.image, DESTINATIONS_BUCKET) : undefined,
            description: d.description,
            type: 'destination',
        })),
        tours: tours.map((t) => ({
            id: t.tour_id,
            name: t.name,
            image: t.TourImages?.[0]?.image_url
                ? toPublicImageUrl(t.TourImages[0].image_url, TOURS_BUCKET)
                : null,
            description: t.description,
            type: 'tour',
        })),
        posts: posts.map((p) => ({
            id: p.post_id,
            name: p.title,
            image: p.image ? toPublicImageUrl(p.image, BLOGS_BUCKET) : null,
            slug: p.slug,
            excerpt: p.excerpt,
            type: 'post',
        })),
    });
};
