/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import generateSitemap from 'vite-plugin-sitemap';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Non-VITE_ variables are only visible here, never in the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:3000';
  // Public address used in sitemap.xml and robots.txt (build time only).
  const siteUrl = (env.SITE_URL || 'https://wanderluxe.vercel.app').replace(/\/+$/, '');

  // On Vercel, frontend/vercel.json forwards /api/* to the Render API, so the
  // browser only ever talks to the site's own origin. That is what lets the
  // session cookie be first-party (httpOnly, SameSite=Strict). An absolute API
  // URL on another site would silently break sign-in, so refuse to build with one.
  const apiUrl = env.VITE_API_URL || env.VITE_BACK_BASE_URL || '';
  if (process.env.VERCEL && mode === 'production' && /^https?:\/\//i.test(apiUrl)) {
    throw new Error(
      `VITE_API_URL is "${apiUrl}", an absolute URL. On Vercel the API is reached through the ` +
        '/api rewrite in vercel.json: set VITE_API_URL=/api (or delete it) in Vercel → Settings → ' +
        'Environment Variables, then redeploy.',
    );
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        ...generateSitemap({
          hostname: siteUrl,
          // Public, indexable pages (the SPA has a single index.html, so list them explicitly).
          dynamicRoutes: [
            '/',
            '/tours',
            '/destinations',
            '/blog',
            '/about',
            '/contact',
            '/faq',
            '/terms-and-conditions',
          ],
        }),
        // Only for `vite build`: under Vitest/dev its closeBundle hook writes into a dist/ that may not exist.
        apply: 'build',
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    server: {
      host: 'localhost',
      port: Number(env.PORT) || 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      sourcemap: false,
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks: they change far less often than app code,
          // so browsers keep them cached across deploys.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
                priority: 3,
              },
              {
                name: 'query',
                test: /node_modules[\\/](@tanstack|axios|zustand)[\\/]/,
                priority: 2,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
