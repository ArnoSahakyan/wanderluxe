import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { storage } from '../lib/storage';
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

/**
 * Re-encodes every upload to WebP (max 1500px wide) and stores it.
 * Decoding with sharp also proves the file really is an image — the
 * client-supplied MIME type alone is not trusted.
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
                .resize({ width: 1500, withoutEnlargement: true })
                .webp({ quality: 85 })
                .toBuffer();
        } catch {
            throw new BadRequestError(`"${file.originalname}" is not a valid image.`);
        }

        const key = `${folder}/${folder}_${randomUUID()}.webp`;
        await storage.put(bucket, key, buffer, 'image/webp');
        keys.push(key);
    }

    return keys;
};
