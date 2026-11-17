import { describe, expect, it } from 'vitest';
import { api } from './helpers';

// vitest.config.ts sets CORS_ORIGIN=http://localhost:5173
describe('CORS', () => {
    it('allows the configured origin and answers preflights', async () => {
        const res = await api().get('/api/categories/1').set('Origin', 'http://localhost:5173');
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');

        const preflight = await api()
            .options('/api/auth/signin')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,authorization');
        expect(preflight.status).toBe(204);
        expect(preflight.headers['access-control-allow-headers']).toMatch(/authorization/i);
    });

    it('sends no CORS headers to other origins', async () => {
        const res = await api().get('/api/categories/1').set('Origin', 'https://evil.example');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
});
