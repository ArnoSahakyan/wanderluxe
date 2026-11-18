/**
 * Guards the accessibility and SEO basics that Lighthouse measured (100 for
 * both on the main pages, 2026-11-18): no axe violations at WCAG 2.1 A/AA,
 * one h1, headings in order, and a page title plus meta description.
 * Performance is not asserted here: it depends on the network and image host.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createTour, signIn } from '../support/api';
import { ADMIN } from '../support/env';

const pages = [
    { path: '/', title: /WanderLuxe/ },
    { path: '/tours', title: 'Tours | WanderLuxe' },
    { path: '/destinations', title: 'Destinations | WanderLuxe' },
    { path: '/blog', title: 'Travel blog | WanderLuxe' },
    { path: '/about', title: 'About us | WanderLuxe' },
    { path: '/contact', title: 'Contact | WanderLuxe' },
    { path: '/faq', title: 'FAQ | WanderLuxe' },
    { path: '/auth/sign-in', title: 'Sign in | WanderLuxe' },
    { path: '/auth/sign-up', title: 'Create an account | WanderLuxe' },
];

const checkPage = async (page: Page, path: string) => {
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/);
    await expect(page.locator('h1')).toHaveCount(1);

    // Heading levels never skip downwards (h1 → h3 without an h2).
    const levels = await page
        .locator('h1, h2, h3, h4, h5, h6')
        .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
    levels.reduce((previous, level) => {
        expect(level, `heading levels on ${path}: ${levels.join(' ')}`).toBeLessThanOrEqual(previous + 1);
        return level;
    }, 1);

    const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual(
        [],
    );
};

for (const { path, title } of pages) {
    test(`${path}: accessible, with a title, description and ordered headings`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveTitle(title);
        await checkPage(page, path);
    });
}

test('a tour page: accessible, titled after the tour, headings in order', async ({ page, request }) => {
    const tour = await createTour(request, await signIn(request, ADMIN));
    await page.goto(`/tours/${tour.tour_id}`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(`${tour.name} | WanderLuxe`);
    await checkPage(page, `/tours/${tour.tour_id}`);
});
