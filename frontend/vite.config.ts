/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import generateSitemap from 'vite-plugin-sitemap';
import path from 'path';

const SITE_URL = 'https://wanderluxe.am';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Non-VITE_ variables are only visible here, never in the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:3000';

  // On Vercel there is no /api proxy: without an absolute API URL every request
  // would hit the static site. Fail the build instead of shipping a broken app.
  if (process.env.VERCEL && mode === 'production' && !env.VITE_API_URL && !env.VITE_BACK_BASE_URL) {
    throw new Error(
      'VITE_API_URL is not set. In Vercel → Settings → Environment Variables add ' +
        'VITE_API_URL=https://<your-render-service>.onrender.com/api, then redeploy.',
    );
  }

  return {
    plugins: [
      react(),
      generateSitemap({
        hostname: SITE_URL,
        dynamicRoutes: ['/'],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
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
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query', 'axios', 'zustand'],
            markdown: ['react-markdown'],
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
