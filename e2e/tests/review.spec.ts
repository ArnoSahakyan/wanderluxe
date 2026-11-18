import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/env';
import { createBooking, createTour, signIn, signInViaUi, signUp, uniqueEmail } from '../support/api';
import { waitForEmail } from '../support/mailpit';

/** Opens the admin's Manage dialog for the booking and moves it to `status`. */
const setStatus = async (page: Page, booking_id: number, status: string, note?: string) => {
    await page.getByRole('button', { name: `Manage booking #${booking_id}` }).click();
    const dialog = page.getByRole('dialog', { name: `Booking #${booking_id}` });
    await dialog.getByRole('radio', { name: new RegExp(`^${status}`) }).check();
    if (note) await dialog.getByLabel('Note (optional)').fill(note);
    await dialog.getByRole('button', { name: 'Update status' }).click();
    await expect(page.getByText(`Booking #${booking_id} is now ${status.toLowerCase()}`)).toBeVisible();
    await expect(dialog).toHaveCount(0);
};

test('an admin confirms and completes a booking, then the customer reviews the tour', async ({ page, request }) => {
    const admin = await signIn(request, ADMIN);
    const tour = await createTour(request, admin, { startInDays: 20 });
    const customer = await signUp(request, { full_name: 'Review Tester', email: uniqueEmail('reviewer') });
    const customerAuth = await signIn(request, customer);
    const booking = await createBooking(request, customerAuth, tour.tour_id);

    // The admin confirms and then completes it from the bookings page.
    await signInViaUi(page, ADMIN);
    await page.goto('/admin/bookings');
    await page.getByLabel('Filter by status').selectOption('pending');
    await setStatus(page, booking.booking_id, 'Confirmed', 'Paid by card');
    await expect(waitForEmail(request, customer.email, /^Booking confirmed/)).resolves.toBeTruthy();

    await page.getByLabel('Filter by status').selectOption('confirmed');
    await setStatus(page, booking.booking_id, 'Completed');
    const thanks = await waitForEmail(request, customer.email, /^How was your trip\?/);
    expect(thanks.HTML).toContain(`/tours/${tour.tour_id}`);

    // The history lists every step.
    await page.getByLabel('Filter by status').selectOption('completed');
    await page.getByRole('button', { name: `Manage booking #${booking.booking_id}` }).click();
    const dialog = page.getByRole('dialog', { name: `Booking #${booking.booking_id}` });
    await expect(dialog.getByText('Booked (Pending)')).toBeVisible();
    await expect(dialog.getByText('Pending → Confirmed')).toBeVisible();
    await expect(dialog.getByText('“Paid by card”')).toBeVisible();
    await expect(dialog.getByText('Confirmed → Completed')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // The customer finds the trip under Past and reviews it.
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await signInViaUi(page, customer);
    await page.goto('/profile/bookings?view=past');
    await expect(page.getByRole('heading', { name: tour.name })).toBeVisible();
    await page.getByRole('link', { name: 'Write a review' }).click();

    await expect(page.getByRole('heading', { name: 'Leave a Review' })).toBeVisible();
    await page.getByRole('radio', { name: '4 stars' }).click();
    await page.getByLabel('Your Review').fill('Well organised, great guide, would book again.');
    await page.getByRole('button', { name: 'Submit Review' }).click();
    await expect(page.getByText('Review submitted successfully!')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thanks for your review' })).toBeVisible();
    await expect(page.getByText('Well organised, great guide, would book again.')).toBeVisible();
});

test('a customer who has not travelled sees why they cannot review', async ({ page, request }) => {
    const tour = await createTour(request, await signIn(request, ADMIN), { startInDays: 20 });
    const customer = await signUp(request, { full_name: 'Future Traveller', email: uniqueEmail('future') });
    await createBooking(request, await signIn(request, customer), tour.tour_id);

    await page.goto(`/tours/${tour.tour_id}`);
    await expect(page.getByRole('heading', { name: 'Travelled with us?' })).toBeVisible();

    await signInViaUi(page, customer);
    await page.goto(`/tours/${tour.tour_id}`);
    await expect(page.getByRole('heading', { name: 'Reviews open after your trip' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leave a Review' })).toHaveCount(0);
});
