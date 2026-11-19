import { config } from '../../src/config/env';
import { storage } from '../../src/lib/storage';

/** A stored image, from storage or (local driver only) the read-only STORAGE_FALLBACK_URL. */
export const loadOriginal = async (bucket: string, key: string): Promise<Buffer | null> => {
    const stored = await storage.get(bucket, key);
    if (stored || config.storage.driver !== 'local' || !config.storage.fallbackUrl) return stored;
    const response = await fetch(`${config.storage.fallbackUrl}/${bucket}/${key}`);
    return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
};
