import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globalSetup: ['./tests/globalSetup.ts'],
        // One database, so files run one after another.
        fileParallelism: false,
        testTimeout: 20_000,
        hookTimeout: 60_000,
        env: {
            NODE_ENV: 'test',
            DB_NAME: process.env.DB_NAME_TEST ?? 'wanderluxe_test',
            UPLOADS_DIR: path.join(os.tmpdir(), 'wanderluxe-test-uploads'),
            STORAGE_DRIVER: 'local',
            STORAGE_PUBLIC_URL: 'http://localhost:3000/uploads',
            STORAGE_FALLBACK_URL: '',
            BCRYPT_ROUNDS: '10',
            APP_URL: 'http://localhost:5173',
            // trailing slash on purpose: must still match the browser's Origin header
            CORS_ORIGIN: 'http://localhost:5173/',
            CONTACT_RECIPIENT_EMAIL: 'inbox@wanderluxe.test',
        },
    },
});
