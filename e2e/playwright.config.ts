import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_URL, WEB_PORT, apiEnv } from './support/env';

/**
 * End-to-end tests against the LOCAL stack only:
 *   docker PostgreSQL + Mailpit (`npm run db:up`) → API (`npm run dev:backend`)
 *   → Vite dev server (`npm run dev:frontend`).
 *
 * Both servers are started here, on their own ports, and are never reused: an
 * already-running server could be pointed at another database.
 */
for (const url of [API_URL, WEB_URL]) {
    if (new URL(url).hostname !== 'localhost') throw new Error(`e2e must run against localhost, got ${url}`);
}

const repoRoot = new URL('..', import.meta.url).pathname;

export default defineConfig({
    testDir: './tests',
    outputDir: './test-results',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL: WEB_URL,
        locale: 'en-US',
        timezoneId: 'UTC',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: [
        {
            name: 'api',
            // Rebuild the e2e database, then start the API against it.
            command: 'bash e2e/scripts/prepare-db.sh && npm run dev:backend',
            cwd: repoRoot,
            url: `${API_URL}/health`,
            env: apiEnv,
            reuseExistingServer: false,
            timeout: 180_000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            name: 'web',
            // `npm run dev:frontend` does not forward extra arguments, so call the workspace directly.
            command: `npm run dev -w frontend -- --port ${WEB_PORT} --strictPort`,
            cwd: repoRoot,
            url: WEB_URL,
            env: { API_PROXY_TARGET: API_URL, VITE_API_URL: '/api' },
            reuseExistingServer: false,
            timeout: 120_000,
        },
    ],
});
