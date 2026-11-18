import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/env';
import { createTour, getTour, signIn, signInViaUi, signUp, uniqueEmail } from '../support/api';
import { waitForEmail } from '../support/mailpit';

/** The "Available Spots: N" line on the tour page. */
const availableSpots = (page: Page) => page.getByText('Available Spots:').locator('..');

test('a customer books a future tour, cancels it and finds it under Cancelled', async ({ page, request }) => {
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

    // The customer gets a "booking received" e-mail.
    const received = await waitForEmail(request, customer.email, /^Booking received/);
    expect(received.Subject).toContain(tour.name);
    expect(received.HTML).toContain('<strong>Guests:</strong> 3');

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
    await dialog.getByLabel('Reason (optional)').fill('Plans changed');
    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();

    // The booking is kept as history under the Cancelled tab, not deleted.
    await expect(page.getByText('Booking cancelled successfully!')).toBeVisible();
    await expect(page).toHaveURL(/\/profile\/bookings\?view=cancelled$/);
    await expect(page.getByRole('tab', { name: 'Cancelled' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: tour.name })).toBeVisible();
    await expect(page.getByText(/^Cancelled on /)).toBeVisible();
    await page.getByRole('tab', { name: 'Upcoming' }).click();
    await expect(page.getByText('No upcoming bookings')).toBeVisible();

    await page.getByRole('tab', { name: 'Cancelled' }).click();
    await page.getByRole('link', { name: 'View Details' }).click();
    await expect(page.getByText('You cancelled this booking', { exact: false })).toBeVisible();
    await expect(page.getByText('Reason: Plans changed')).toBeVisible();
    expect((await waitForEmail(request, customer.email, /^Booking cancelled/)).HTML).toContain('As you asked');
    await expect(page.getByRole('button', { name: 'Cancel Booking' })).toHaveCount(0);

    // The seats are released.
    expect((await getTour(request, tour.tour_id)).available_spots).toBe(8);
    await page.goto(`/tours/${tour.tour_id}`);
    await expect(availableSpots(page)).toHaveText(/Available Spots:\s*8$/);
    await expect(page.getByRole('button', { name: 'Book Now' })).toBeEnabled();
});
