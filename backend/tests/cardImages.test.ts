import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { TourImage } from '../src/db/models';
import { TOURS_BUCKET, DESTINATIONS_BUCKET } from '../src/constants';
import { resolveLocalPath, toCardKey } from '../src/lib/storage';
import { api, createTour, createUser, pngBuffer } from './helpers';

let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
    admin = await createUser('admin');
});

const photo = (width: number, height: number) =>
    // Noise, so the encoded sizes behave like a photo's.
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: '#c85a28',
            noise: { type: 'gaussian', mean: 128, sigma: 40 },
        },
    })
        .jpeg({ quality: 80 })
        .toBuffer();

const stored = (bucket: string, key: string) => resolveLocalPath(bucket, key);
const widthOf = async (bucket: string, key: string) => (await sharp(stored(bucket, key)).metadata()).width;

describe('card-size images', () => {
    it('derives the card key from the image key', () => {
        expect(toCardKey('Bali/Bali_1.webp')).toBe('Bali/Bali_1_card.webp');
        expect(toCardKey('12/old-photo.JPG')).toBe('12/old-photo_card.webp');
    });

    it('stores an 800px card next to every upload and returns both URLs', async () => {
        const created = await api()
            .post('/api/destinations')
            .set(admin.auth)
            .field('name', 'Card Land')
            .attach('images', await photo(2400, 1600), { filename: 'big.jpg', contentType: 'image/jpeg' });
        expect(created.status).toBe(201);
        const key: string = created.body.image;

        expect(await widthOf(DESTINATIONS_BUCKET, key)).toBe(1500);
        expect(await widthOf(DESTINATIONS_BUCKET, toCardKey(key))).toBe(800);
        expect(fs.statSync(stored(DESTINATIONS_BUCKET, toCardKey(key))).size).toBeLessThan(
            fs.statSync(stored(DESTINATIONS_BUCKET, key)).size,
        );

        const one = await api().get(`/api/destinations/${created.body.destination_id}`);
        expect(one.body.image).toMatch(new RegExp(`/${key}$`));
        expect(one.body.image_card).toMatch(new RegExp(`/${toCardKey(key)}$`));

        const list = await api().get('/api/destinations?page=1&limit=100');
        const listed = list.body.destinations.find(
            (d: { destination_id: number }) => d.destination_id === created.body.destination_id,
        );
        expect(listed.image_card).toBe(one.body.image_card);

        // Deleting the destination removes both files.
        expect((await api().delete(`/api/destinations/${created.body.destination_id}`).set(admin.auth)).status).toBe(
            200,
        );
        expect(fs.existsSync(stored(DESTINATIONS_BUCKET, key))).toBe(false);
        expect(fs.existsSync(stored(DESTINATIONS_BUCKET, toCardKey(key)))).toBe(false);
    });

    it('never enlarges small images', async () => {
        const tour = await createTour(admin.auth); // 40×30 cover
        const cover = await TourImage.findOne({ where: { tour_id: tour.tour_id } });
        expect(await widthOf(TOURS_BUCKET, toCardKey(cover!.image_url))).toBe(40);
    });

    it('tour lists, details and gallery thumbnails use the card copies; deleting a photo removes its card', async () => {
        const tour = await createTour(admin.auth);
        const added = await api()
            .post(`/api/tours/${tour.tour_id}/images`)
            .set(admin.auth)
            .attach('images', await pngBuffer(), { filename: 'second.png', contentType: 'image/png' });
        expect(added.status).toBeLessThan(300);

        const details = await api().get(`/api/tours/${tour.tour_id}`);
        expect(details.body.images).toHaveLength(2);
        for (const image of details.body.images) {
            expect(image.card_url).toBe(image.image_url.replace(/\.webp$/, '_card.webp'));
        }

        const list = await api().get('/api/tours?page=1&limit=100');
        const listed = list.body.tours.find((t: { tour_id: number }) => t.tour_id === tour.tour_id);
        expect(listed.image_card).toBe(listed.image.replace(/\.webp$/, '_card.webp'));

        const second = await TourImage.findOne({ where: { tour_id: tour.tour_id, is_cover: false } });
        const res = await api().delete(`/api/tours/${tour.tour_id}/images/${second!.image_id}`).set(admin.auth);
        expect(res.status).toBeLessThan(300);
        expect(fs.existsSync(stored(TOURS_BUCKET, second!.image_url))).toBe(false);
        expect(fs.existsSync(stored(TOURS_BUCKET, toCardKey(second!.image_url)))).toBe(false);
    });
});
