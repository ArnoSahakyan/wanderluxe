/**
 * Direct API calls for test set-up (accounts, tours) and for checking results
 * the UI does not show. Each test creates the data it needs, so tests never
 * depend on each other or on rows in the imported catalogue.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL } from './env';

/** Meets the API password policy: upper, lower, digit, symbol, ≥ 8 chars. */
export const PASSWORD = 'E2e!Passw0rd';

let counter = 0;
export const unique = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${process.pid}-${++counter}`;
export const uniqueEmail = (prefix = 'user') => `${unique(prefix)}@e2e.test`;

const api = (path: string) => `${API_URL}/api${path}`;

const ok = async <T>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> => {
    if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
    return (await res.json()) as T;
};

export const signUp = async (
    request: APIRequestContext,
    user: { full_name: string; email: string; password?: string },
) => {
    await ok(
        await request.post(api('/auth/signup'), { data: { password: PASSWORD, ...user } }),
        `sign-up ${user.email}`,
    );
    return { ...user, password: user.password ?? PASSWORD };
};

export const signIn = async (request: APIRequestContext, creds: { email: string; password: string }) => {
    const body = await ok<{ token: string }>(
        await request.post(api('/auth/signin'), { data: creds }),
        `sign-in ${creds.email}`,
    );
    return { Authorization: `Bearer ${body.token}` };
};

/** Smallest valid PNG (1×1), so tour creation passes the API's image check. */
const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
);

const isoDay = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

export interface Tour {
    tour_id: number;
    name: string;
    price: number;
    available_spots: number;
    start_date: string;
    end_date: string;
}

/** Creates a tour as admin. Negative `startInDays` gives a tour that has already departed. */
export const createTour = async (
    request: APIRequestContext,
    adminAuth: Record<string, string>,
    opts: { name?: string; startInDays?: number; days?: number; spots?: number; price?: number } = {},
): Promise<Tour> => {
    const [categories, destinations] = await Promise.all([
        ok<{ category_id: number }[]>(await request.get(api('/categories'), { headers: adminAuth }), 'list categories'),
        ok<{ destinations: { destination_id: number }[] }>(
            await request.get(api('/destinations?limit=1')),
            'list destinations',
        ),
    ]);
    const start = opts.startInDays ?? 60;
    const created = await ok<{ tour_id: number }>(
        await request.post(api('/tours'), {
            headers: adminAuth,
            multipart: {
                name: opts.name ?? unique('E2E tour'),
                description: 'Created by the Playwright end-to-end tests.',
                price: String(opts.price ?? 250),
                available_spots: String(opts.spots ?? 10),
                start_date: isoDay(start),
                end_date: isoDay(start + (opts.days ?? 5)),
                category_id: String(categories[0].category_id),
                destination_id: String(destinations.destinations[0].destination_id),
                images: { name: 'cover.png', mimeType: 'image/png', buffer: PNG_1PX },
            },
        }),
        'create tour',
    );
    return getTour(request, created.tour_id);
};

/** Books `tour_id` as the signed-in customer and returns the booking. */
export const createBooking = async (
    request: APIRequestContext,
    auth: Record<string, string>,
    tour_id: number,
    number_of_people = 1,
) =>
    ok<{ booking_id: number; status: string }>(
        await request.post(api('/booking'), { headers: auth, data: { tour_id, number_of_people } }),
        `book tour ${tour_id}`,
    );

export const getTour = async (request: APIRequestContext, id: number) =>
    ok<Tour>(await request.get(api(`/tours/${id}`)), `get tour ${id}`);

/**
 * Signs in through the real form. A signed-in user is sent from the auth pages
 * to their profile dashboard, which is where this leaves the page.
 */
export const signInViaUi = async (page: Page, creds: { email: string; password: string }) => {
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email address').fill(creds.email);
    await page.getByLabel('Password', { exact: true }).fill(creds.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/profile(\/dashboard)?$/);
    await expect(page.getByRole('heading', { name: /^Welcome back, / })).toBeVisible();
};
