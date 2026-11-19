import { Response } from 'express';
import { Op } from 'sequelize';
import { Destination, Tour, Post } from '../db/models';
import { toImageUrls, containsPattern } from '../utils';
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
                end_date: { [Op.gte]: new Date() },
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
            ...toImageUrls(d.image, DESTINATIONS_BUCKET),
            description: d.description,
            type: 'destination',
        })),
        tours: tours.map((t) => ({
            id: t.tour_id,
            name: t.name,
            ...toImageUrls(t.TourImages?.[0]?.image_url, TOURS_BUCKET),
            description: t.description,
            type: 'tour',
        })),
        posts: posts.map((p) => ({
            id: p.post_id,
            name: p.title,
            ...toImageUrls(p.image, BLOGS_BUCKET),
            slug: p.slug,
            excerpt: p.excerpt,
            type: 'post',
        })),
    });
};
