import { expect, test } from '@playwright/test';
import { ADMIN } from '../support/env';
import { createTour, getTour, signIn, signInViaUi } from '../support/api';

const isoDay = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

test('an admin signs in, sees the dashboard metrics and changes a tour’s dates', async ({ page, request }) => {
    const tour = await createTour(request, await signIn(request, ADMIN), { startInDays: 30, days: 4 });

    await signInViaUi(page, ADMIN);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open user menu' }).click();
    await page.getByRole('menuitem', { name: 'Admin Panel' }).click();

    // Dashboard metrics come from GET /api/stats.
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Failed to load dashboard statistics.')).toHaveCount(0);
    const metric = (name: string) =>
        page.locator('dl > div').filter({ has: page.getByRole('term').filter({ hasText: name }) }).getByRole('definition');
    for (const name of ['Total Users', 'Total Bookings', 'Total Tours', 'Total Destinations', 'Total Categories']) {
        await expect(metric(name), name).toHaveText(/^\d+$/);
    }
    await expect(metric('Total Tours')).not.toHaveText('0');
    for (const name of ['Revenue (completed trips)', 'Booked (upcoming trips)']) {
        await expect(metric(name), name).toHaveText(/^\$\d+\.\d{2}$/);
    }
    await expect(page.getByRole('heading', { name: 'Recent Bookings' })).toBeVisible();

    // Edit the tour's dates.
    await page.goto(`/admin/tours/${tour.tour_id}`);
    await expect(page.getByRole('heading', { name: 'Edit Tour' })).toBeVisible();
    await expect(page.getByLabel('Tour Name')).toHaveValue(tour.name);
    await expect(page.getByLabel('Start Date')).toHaveValue(tour.start_date);
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();

    const start = isoDay(90);
    const end = isoDay(97);
    await page.getByLabel('Start Date').fill(start);
    await page.getByLabel('End Date').fill(end);
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Tour updated successfully')).toBeVisible();
    const saved = await getTour(request, tour.tour_id);
    expect([saved.start_date, saved.end_date]).toEqual([start, end]);
    expect(saved.name).toBe(tour.name);

    // The public page reflects the new length (end − start).
    await page.goto(`/tours/${tour.tour_id}`);
    await expect(page.getByText('Duration:').locator('..')).toHaveText(/Duration:\s*7 days/);
});
