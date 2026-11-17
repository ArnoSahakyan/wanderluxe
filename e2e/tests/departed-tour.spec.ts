import { expect, test } from '@playwright/test';
import { ADMIN, CUSTOMER } from '../support/env';
import { createTour, signIn, signInViaUi } from '../support/api';

test('a tour that has already departed cannot be booked', async ({ page, request }) => {
    const admin = await signIn(request, ADMIN);
    const tour = await createTour(request, admin, { startInDays: -10, days: 5, spots: 10 });

    await signInViaUi(page, CUSTOMER);
    await page.goto(`/tours/${tour.tour_id}`);
    await expect(page.getByRole('heading', { level: 1, name: tour.name })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Book Now' })).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Guests:' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'This tour has already departed' })).toBeVisible();
});
