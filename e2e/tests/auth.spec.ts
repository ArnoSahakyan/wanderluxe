import { expect, test } from '@playwright/test';
import { PASSWORD, signInViaUi, uniqueEmail } from '../support/api';

test('a visitor signs up, signs in and sees themself on the profile', async ({ page }) => {
    const user = { full_name: 'Ada Lovelace', email: uniqueEmail('signup'), password: PASSWORD };

    await page.goto('/auth/sign-up');
    await page.getByLabel('Full name').fill(user.full_name);
    await page.getByLabel('Email address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByLabel('Confirm password').fill(user.password);
    await page.getByRole('checkbox', { name: /I agree to the Terms of Service/ }).check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Account created! Please sign in.')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in$/);

    await signInViaUi(page, user);
    await expect(page.getByRole('heading', { name: 'Welcome back, Ada!' })).toBeVisible();

    // The navbar's user menu leads back to the same profile.
    await page.goto('/');
    await page.getByRole('button', { name: 'Open user menu' }).click();
    await page.getByRole('menuitem', { name: 'Account Settings' }).click();
    await expect(page).toHaveURL(/\/profile\/info$/);
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
    await expect(page.getByLabel('Full Name')).toHaveValue(user.full_name);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(user.email);
});
