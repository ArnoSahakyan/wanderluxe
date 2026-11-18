import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { removeQuietly, storage, toCardKey } from '../lib/storage';
import { BadRequestError } from './errors';

/** Folder-safe identifier: "South Africa" → "South_Africa". */
export const toStorageSegment = (value: string | number): string => {
    const segment = String(value)
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 80);
    return segment || 'item';
};

/** Width and quality of the full image and of the card copy used in lists. */
export const FULL_IMAGE = { width: 1500, quality: 85 };
export const CARD_IMAGE = { width: 800, quality: 75 };

/** Card-size copy of an already decoded image (about a fifth of the full file). */
export const toCardImage = (image: Buffer): Promise<Buffer> =>
    sharp(image)
        .resize({ width: CARD_IMAGE.width, withoutEnlargement: true })
        .webp({ quality: CARD_IMAGE.quality })
        .toBuffer();

/**
 * Re-encodes every upload to WebP (max 1500px wide) and stores it, plus a
 * card-size copy at toCardKey(key). Decoding with sharp also proves the file
 * really is an image — the client-supplied MIME type alone is not trusted.
 * Returns the storage keys in the same order as the input files.
 */
export const uploadAndProcessImages = async (
    files: Express.Multer.File[],
    bucket: string,
    identifier: string | number,
): Promise<string[]> => {
    const folder = toStorageSegment(identifier);
    const keys: string[] = [];

    for (const file of files) {
        let buffer: Buffer;
        try {
            buffer = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
                .rotate()
                .resize({ width: FULL_IMAGE.width, withoutEnlargement: true })
                .webp({ quality: FULL_IMAGE.quality })
                .toBuffer();
        } catch {
            throw new BadRequestError(`"${file.originalname}" is not a valid image.`);
        }

        const key = `${folder}/${folder}_${randomUUID()}.webp`;
        await storage.put(bucket, key, buffer, 'image/webp');
        try {
            await storage.put(bucket, toCardKey(key), await toCardImage(buffer), 'image/webp');
        } catch (err) {
            await removeQuietly(bucket, [key]);
            throw err;
        }
        keys.push(key);
    }

    return keys;
};
