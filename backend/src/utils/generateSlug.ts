import { Op, type Transaction } from 'sequelize';
import { Post } from '../db/models';

export const generateSlug = (title: string): string =>
    title
        .normalize('NFKD')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'post';

/**
 * Slug derived from `source` that no other post uses (the post being edited,
 * `excludePostId`, may keep its own slug). One query instead of a loop.
 */
export const generateUniqueSlug = async (
    source: string,
    options: { excludePostId?: number; transaction?: Transaction } = {},
): Promise<string> => {
    const base = generateSlug(source);
    const taken = await Post.findAll({
        attributes: ['slug'],
        where: {
            slug: { [Op.or]: [base, { [Op.like]: `${base}-%` }] },
            ...(options.excludePostId ? { post_id: { [Op.ne]: options.excludePostId } } : {}),
        },
        transaction: options.transaction,
    });
    const used = new Set(taken.map((p) => p.slug));
    if (!used.has(base)) return base;
    let n = 1;
    while (used.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
};
