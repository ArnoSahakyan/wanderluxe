import { expect, test } from '@playwright/test';
import { PASSWORD, signInViaUi, signUp, uniqueEmail } from '../support/api';
import { API_URL } from '../support/env';

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

test('the session survives a reload via an httpOnly cookie and sign-out ends it on the server', async ({
    page,
    context,
    request,
}) => {
    const user = await signUp(request, {
        full_name: 'Grace Hopper',
        email: uniqueEmail('session'),
    });
    await signInViaUi(page, user);

    // No token is reachable from page scripts: not in storage, not in document.cookie.
    const exposed = await page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
    expect(exposed).not.toMatch(/token/i);
    expect(exposed).not.toContain('wl_session');
    const [cookie] = (await context.cookies()).filter((c) => c.name === 'wl_session');
    expect(cookie).toMatchObject({
        httpOnly: true,
        sameSite: 'Strict',
        path: '/api/auth',
    });

    // A reload drops the in-memory access token; the cookie gets a new one.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back, Grace!' })).toBeVisible();
    await page.goto('/profile/info');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(user.email);

    // Keep a copy of the cookie, as a thief would, then sign out.
    const copied = (await context.cookies()).find((c) => c.name === 'wl_session')!;
    await page.goto('/');
    await page.getByRole('button', { name: 'Open user menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Open user menu' })).toBeHidden();
    expect((await context.cookies()).some((c) => c.name === 'wl_session')).toBe(false);

    // The server revoked the session: the copied cookie no longer works.
    const replay = await request.post(`${API_URL}/api/auth/refresh`, {
        headers: { Cookie: `wl_session=${copied.value}` },
    });
    expect(replay.status()).toBe(401);

    // Protected pages now send the visitor to sign in.
    await page.goto('/profile/info');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
});
