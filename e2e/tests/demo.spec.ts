import { expect, test } from '@playwright/test';

test('a visitor tries the demo customer: can browse the profile, cannot change the account', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.getByRole('button', { name: 'Try as customer' }).click();

    await expect(page).toHaveURL(/\/profile\/dashboard$/);
    await expect(page.getByRole('heading', { name: /^Welcome back, Demo!/ })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'demo account' })).toBeVisible();

    // Account changes are refused by the API with a clear message.
    await page.goto('/profile/info');
    await page.getByLabel('Full Name').fill('Someone Else');
    await page.getByRole('button', { name: 'Save Personal Info' }).click();
    await expect(page.getByText(/This is a demo account/).first()).toBeVisible();
});

test('a visitor tries the demo admin: read-only, with customer details masked', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.getByRole('button', { name: 'Try as admin' }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toBeVisible();

    await page.goto('/admin/users');
    // The local customer account exists in every e2e database; its address is masked.
    await expect(page.getByText('c•••@wanderluxe.local').first()).toBeVisible();
    await expect(page.getByText('customer@wanderluxe.local')).toHaveCount(0);
});
