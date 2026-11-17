import { expect, test } from '@playwright/test';
import { API_URL, WEB_URL } from '../support/env';
import { signInViaUi, signUp, uniqueEmail } from '../support/api';
import { linkIn, waitForEmail } from '../support/mailpit';

test('"Forgot password" e-mails a reset link that sets a new password', async ({ page, request }) => {
    const user = await signUp(request, { full_name: 'Reset Tester', email: uniqueEmail('reset') });
    const newPassword = 'N3w!Passw0rd';

    await page.goto('/auth/sign-in');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
    await page.getByLabel('Email address').fill(user.email);
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.getByText('Reset link sent! Please check your inbox.')).toBeVisible();

    const mail = await waitForEmail(request, user.email);
    const link = linkIn(mail, '/auth/reset-password?token=');
    expect(new URL(link).origin, 'the e-mail links to the e2e frontend').toBe(WEB_URL);

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Set New Password' })).toBeVisible();
    await page.getByLabel('New Password').fill(newPassword);
    await page.getByLabel('Confirm Password').fill(newPassword);
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByText('Password successfully reset! You can now sign in.')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in$/);

    await signInViaUi(page, { email: user.email, password: newPassword });

    // The old password no longer works, and the link is single-use.
    const old = await request.post(`${API_URL}/api/auth/signin`, { data: { email: user.email, password: user.password } });
    expect(old.status()).toBe(401);
    const token = new URL(link).searchParams.get('token');
    const reuse = await request.post(`${API_URL}/api/auth/reset-password`, {
        params: { token: token! },
        data: { new_password: 'An0ther!Passw0rd' },
    });
    expect(reuse.status()).toBe(400);
});
