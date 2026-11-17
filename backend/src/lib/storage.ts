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
 * before, so both drivers work with existing data.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { logger } from './logger';

export interface StorageDriver {
    put(bucket: string, key: string, data: Buffer, contentType: string): Promise<void>;
    remove(bucket: string, key: string): Promise<void>;
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
};

export const storage: StorageDriver = config.storage.driver === 'supabase' ? supabaseDriver : localDriver;

/** Public URL for a stored object key. */
export const toPublicImageUrl = (key: string, bucket: string): string =>
    `${config.storage.publicUrl}/${bucket}/${key}`;

/** Delete without failing the request; used after the DB change has committed. */
export const removeQuietly = async (bucket: string, keys: Array<string | null | undefined>) => {
    for (const key of keys) {
        if (!key) continue;
        try {
            await storage.remove(bucket, key);
        } catch (err) {
            logger.warn('Could not delete stored file', { bucket, key, err });
        }
    }
};
