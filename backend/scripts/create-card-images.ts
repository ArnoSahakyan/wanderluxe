/**
 * Creates the card-size copy (toCardKey(key), 800px WebP) for every tour,
 * destination and blog image that does not have one yet. New uploads get their
 * card automatically; this is for images uploaded before cards existed.
 *
 * Reads the image keys from the database and uses the configured storage
 * driver (STORAGE_DRIVER). With the local driver, images that only exist in
 * STORAGE_FALLBACK_URL are downloaded from there and their cards stored locally.
 * Never changes or deletes the original images. Safe to re-run.
 *
 *   npm run images:cards -w backend              # create missing cards
 *   npm run images:cards -w backend -- --dry-run # only list them
 */
import { BLOGS_BUCKET, DESTINATIONS_BUCKET, TOURS_BUCKET } from '../src/constants';
import { config } from '../src/config/env';
import { Destination, Post, TourImage, sequelize } from '../src/db/models';
import { storage, toCardKey } from '../src/lib/storage';
import { toCardImage } from '../src/utils/imageUpload';
import { loadOriginal } from './lib/loadOriginal';

const dryRun = process.argv.includes('--dry-run');

const imageKeys = async (): Promise<Array<{ bucket: string; key: string }>> => {
    const [tourImages, destinations, posts] = await Promise.all([
        TourImage.findAll({ attributes: ['image_url'] }),
        Destination.findAll({ attributes: ['image'] }),
        Post.findAll({ attributes: ['image'] }),
    ]);
    return [
        ...tourImages.map((row) => ({ bucket: TOURS_BUCKET, key: row.image_url })),
        ...destinations.map((row) => ({ bucket: DESTINATIONS_BUCKET, key: row.image ?? '' })),
        ...posts.map((row) => ({ bucket: BLOGS_BUCKET, key: row.image ?? '' })),
    ].filter((item) => item.key);
};

const main = async () => {
    console.log(`Storage: ${config.storage.driver}${dryRun ? ' (dry run)' : ''}`);
    const counts = { created: 0, existing: 0, missing: 0 };

    for (const { bucket, key } of await imageKeys()) {
        const cardKey = toCardKey(key);
        if (await storage.get(bucket, cardKey)) {
            counts.existing++;
            continue;
        }
        const original = await loadOriginal(bucket, key);
        if (!original) {
            console.log(`missing original: ${bucket}/${key}`);
            counts.missing++;
            continue;
        }
        if (!dryRun) await storage.put(bucket, cardKey, await toCardImage(original), 'image/webp');
        console.log(`${dryRun ? 'would create' : 'created'} ${bucket}/${cardKey}`);
        counts.created++;
    }

    console.log(
        `\n${counts.created} ${dryRun ? 'to create' : 'created'}, ${counts.existing} already there, ` +
            `${counts.missing} without an original image.`,
    );
    await sequelize.close();
};

main().catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await sequelize.close();
    process.exit(1);
});
