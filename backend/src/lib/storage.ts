/**
 * Image storage abstraction.
 *
 * Two drivers, chosen with STORAGE_DRIVER:
 *  - "supabase" (production default): Supabase Storage buckets, as before.
 *  - "local" (development default): files under UPLOADS_DIR, served by this API
 *    at /uploads. Nothing is ever written to or deleted from a remote bucket.
 *    Paths that are not on disk (e.g. images referenced by the imported
 *    production dump) are redirected, read-only, to STORAGE_FALLBACK_URL.
 *
 * Database rows store only the object key ("<folder>/<file>.webp"), exactly as
 * before, so both drivers work with existing data. Every image also has a
 * smaller card copy next to it at toCardKey(key); it is not stored in the database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { logger } from './logger';

export interface StorageDriver {
    put(bucket: string, key: string, data: Buffer, contentType: string): Promise<void>;
    remove(bucket: string, key: string): Promise<void>;
    /** The stored file, or null when it does not exist. */
    get(bucket: string, key: string): Promise<Buffer | null>;
}

/** Resolve bucket/key inside the uploads root, rejecting traversal attempts. */
export const resolveLocalPath = (bucket: string, key: string): string => {
    const root = config.storage.uploadsDir;
    const full = path.resolve(root, bucket, key);
    if (!full.startsWith(root + path.sep)) {
        throw new Error('Invalid storage path');
    }
    return full;
};

const localDriver: StorageDriver = {
    async put(bucket, key, data) {
        const file = resolveLocalPath(bucket, key);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, data, { flag: 'wx' });
    },
    async remove(bucket, key) {
        const file = resolveLocalPath(bucket, key);
        try {
            await fs.unlink(file);
        } catch (err) {
            // Files that only exist remotely (fallback) are intentionally left untouched.
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
    },
    async get(bucket, key) {
        try {
            return await fs.readFile(resolveLocalPath(bucket, key));
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw err;
        }
    },
};

let supabase: SupabaseClient | undefined;
const supabaseDriver: StorageDriver = {
    async put(bucket, key, data, contentType) {
        supabase ??= createClient(config.storage.supabaseUrl!, config.storage.supabaseServiceRoleKey!);
        const { error } = await supabase.storage.from(bucket).upload(key, data, { contentType, upsert: false });
        if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async remove(bucket, key) {
        supabase ??= createClient(config.storage.supabaseUrl!, config.storage.supabaseServiceRoleKey!);
        const { error } = await supabase.storage.from(bucket).remove([key]);
        if (error) throw new Error(`Storage deletion failed: ${error.message}`);
    },
    async get(bucket, key) {
        supabase ??= createClient(config.storage.supabaseUrl!, config.storage.supabaseServiceRoleKey!);
        const { data, error } = await supabase.storage.from(bucket).download(key);
        if (error) {
            // A missing object surfaces as a 400/404 StorageError.
            const status = (error as { status?: number; statusCode?: string }).status;
            if (status === 400 || status === 404 || /not found/i.test(error.message)) return null;
            throw new Error(`Storage download failed: ${error.message}`);
        }
        return Buffer.from(await data.arrayBuffer());
    },
};

export const storage: StorageDriver = config.storage.driver === 'supabase' ? supabaseDriver : localDriver;

/** Public URL for a stored object key. */
export const toPublicImageUrl = (key: string, bucket: string): string =>
    `${config.storage.publicUrl}/${bucket}/${key}`;

/** Key of an image's card-size copy: "Bali/Bali_<uuid>.webp" → "Bali/Bali_<uuid>_card.webp". */
export const toCardKey = (key: string): string => `${key.replace(/\.[a-z0-9]+$/i, '')}_card.webp`;

/** `image` (full size) and `image_card` (for cards and thumbnails) URLs, or nulls. */
export const toImageUrls = (key: string | null | undefined, bucket: string) =>
    key
        ? { image: toPublicImageUrl(key, bucket), image_card: toPublicImageUrl(toCardKey(key), bucket) }
        : { image: null, image_card: null };

/**
 * Delete images (and their card copies) without failing the request; used after
 * the DB change has committed.
 */
export const removeQuietly = async (bucket: string, keys: Array<string | null | undefined>) => {
    for (const key of keys) {
        if (!key) continue;
        for (const file of [key, toCardKey(key)]) {
            try {
                await storage.remove(bucket, file);
            } catch (err) {
                logger.warn('Could not delete stored file', { bucket, key: file, err });
            }
        }
    }
};
