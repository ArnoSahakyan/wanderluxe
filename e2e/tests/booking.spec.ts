import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/env';
import { createTour, getTour, signIn, signInViaUi, signUp, uniqueEmail } from '../support/api';

/** The "Available Spots: N" line on the tour page. */
const availableSpots = (page: Page) => page.getByText('Available Spots:').locator('..');

test('a customer books a future tour, finds it in My Bookings and cancels it', async ({ page, request }) => {
    const admin = await signIn(request, ADMIN);
    const tour = await createTour(request, admin, { startInDays: 45, spots: 8, price: 120 });
    const customer = await signUp(request, { full_name: 'Booking Tester', email: uniqueEmail('booker') });

    await signInViaUi(page, customer);

    // Book three seats.
    await page.goto(`/tours/${tour.tour_id}`);
    await expect(page.getByRole('heading', { level: 1, name: tour.name })).toBeVisible();
    await expect(availableSpots(page)).toHaveText(/Available Spots:\s*8$/);
    await page.getByRole('spinbutton', { name: 'Guests:' }).fill('3');
    await expect(page.getByText('Total for 3 guests')).toBeVisible();
    await page.getByRole('button', { name: 'Book Now' }).click();

    await expect(page.getByText('Booking successful!')).toBeVisible();
    await expect(availableSpots(page)).toHaveText(/Available Spots:\s*5$/);

    // It is listed under My Bookings.
    await page.getByRole('button', { name: 'Open user menu' }).click();
    await page.getByRole('menuitem', { name: 'Dashboard' }).click();
    await page.getByRole('link', { name: 'My Bookings' }).click();
    await expect(page.getByRole('heading', { name: 'Your Bookings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: tour.name })).toBeVisible();
    await expect(page.getByText('3 people')).toBeVisible();

    // Cancel it through the confirm dialog.
    await page.getByRole('link', { name: 'View Details' }).click();
    await expect(page.getByRole('heading', { name: 'Your Booking Summary' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel Booking' }).click();

    // (The dialog element itself has no box of its own; its panel is fixed-positioned.)
    const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
    await expect(dialog.getByRole('heading', { name: 'Cancel this booking?' })).toBeVisible();
    // "Keep booking" closes the dialog without cancelling.
    await dialog.getByRole('button', { name: 'Keep booking' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel Booking' }).click();
    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();

    await expect(page.getByText('Booking cancelled successfully!')).toBeVisible();
    await expect(page).toHaveURL(/\/profile\/bookings$/);
    await expect(page.getByText('No bookings available')).toBeVisible();

    // The seats are released.
    expect((await getTour(request, tour.tour_id)).available_spots).toBe(8);
    await page.goto(`/tours/${tour.tour_id}`);
    await expect(availableSpots(page)).toHaveText(/Available Spots:\s*8$/);
    await expect(page.getByRole('button', { name: 'Book Now' })).toBeEnabled();
});
