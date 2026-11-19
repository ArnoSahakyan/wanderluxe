/**
 * Adds a tour that has already ended, so the demo customer has a finished trip
 * to review (see ensureDemoFinishedTrip in src/lib/demo.ts). It copies an
 * existing tour: same name with the month added, description, price,
 * destination, category and photos, dated four months ago. Ended tours are
 * left out of the catalog and search, and can't be booked.
 *
 * Does nothing if a tour has already ended: the demo uses the most recent one.
 * Never changes the source tour or its photos.
 *
 *   npm run db:demo-trip -w backend -- --from 4 --dry-run
 *   npm run db:demo-trip -w backend -- --from 4
 */
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { TOURS_BUCKET } from '../src/constants';
import { config } from '../src/config/env';
import { Tour, TourImage, sequelize } from '../src/db/models';
import { removeQuietly, storage, toCardKey } from '../src/lib/storage';
import { toCardImage, toStorageSegment } from '../src/utils/imageUpload';
import { loadOriginal } from './lib/loadOriginal';

const DAY_MS = 24 * 60 * 60 * 1000;
const dryRun = process.argv.includes('--dry-run');
const fromIndex = process.argv.indexOf('--from');
const sourceId = Number(process.argv[fromIndex + 1]);

const main = async () => {
    if (fromIndex === -1 || !Number.isInteger(sourceId)) throw new Error('Usage: --from <tour_id> [--dry-run]');
    const host = config.db.url ? new URL(config.db.url).hostname : config.db.host;
    console.log(`Database host: ${host}, storage: ${config.storage.driver}${dryRun ? ' (dry run)' : ''}`);

    const ended = await Tour.findOne({ where: { end_date: { [Op.lt]: new Date() } }, order: [['end_date', 'DESC']] });
    if (ended) {
        console.log(`Tour ${ended.tour_id} "${ended.name}" has already ended; the demo uses it. Nothing to do.`);
        return;
    }

    const source = await Tour.findByPk(sourceId, { include: [{ model: TourImage, as: 'TourImages' }] });
    if (!source) throw new Error(`Tour ${sourceId} not found.`);

    // Same length as the source tour, starting about four months ago (midnight UTC).
    const length = new Date(source.end_date).getTime() - new Date(source.start_date).getTime();
    const start = new Date(Math.floor((Date.now() - 120 * DAY_MS) / DAY_MS) * DAY_MS);
    const end = new Date(start.getTime() + length);
    const month = start.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const name = `${source.name} – ${month}`;
    const images = [...(source.TourImages ?? [])].sort((a, b) => Number(b.is_cover) - Number(a.is_cover));

    console.log(`Source: tour ${source.tour_id} "${source.name}" with ${images.length} photos`);
    console.log(`New tour: "${name}", ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);
    if (dryRun) return;

    const uploaded: string[] = [];
    try {
        const tour = await sequelize.transaction(async (transaction) => {
            const created = await Tour.create(
                {
                    name,
                    description: source.description,
                    price: source.price,
                    available_spots: source.available_spots,
                    start_date: start,
                    end_date: end,
                    category_id: source.category_id,
                    destination_id: source.destination_id,
                },
                { transaction },
            );
            const folder = toStorageSegment(created.tour_id);
            for (const image of images) {
                const original = await loadOriginal(TOURS_BUCKET, image.image_url);
                if (!original) {
                    console.log(`skipped missing photo ${TOURS_BUCKET}/${image.image_url}`);
                    continue;
                }
                const key = `${folder}/${folder}_${randomUUID()}.webp`;
                await storage.put(TOURS_BUCKET, key, original, 'image/webp');
                uploaded.push(key);
                await storage.put(TOURS_BUCKET, toCardKey(key), await toCardImage(original), 'image/webp');
                await TourImage.create(
                    { tour_id: created.tour_id, image_url: key, is_cover: uploaded.length === 1 },
                    { transaction },
                );
            }
            return created;
        });
        console.log(`Created tour ${tour.tour_id} with ${uploaded.length} photos.`);
    } catch (err) {
        // removeQuietly also removes each photo's card copy.
        await removeQuietly(TOURS_BUCKET, uploaded);
        throw err;
    }
};

main()
    .then(() => sequelize.close())
    .catch(async (err) => {
        console.error(err instanceof Error ? err.message : err);
        await sequelize.close();
        process.exit(1);
    });
