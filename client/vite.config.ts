import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const PUBLIC_PAGES = ['/plans', '/login', '/register'];
const PRIVATE_PREFIXES = [
  '/api/',
  '/admin',
  '/dashboard',
  '/workspace',
  '/profile',
  '/notifications',
];

/** Writes robots.txt and sitemap.xml with absolute URLs from VITE_SITE_URL at build time. */
function seoFiles(mode: string): Plugin {
  const site = (loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? '').replace(/\/$/, '');
  return {
    name: 'planpilot-seo-files',
    apply: 'build',
    generateBundle() {
      const robots = ['User-agent: *', ...PRIVATE_PREFIXES.map((path) => `Disallow: ${path}`)];
      if (site) robots.push(`Sitemap: ${site}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` });
      if (!site) return;
      const urls = PUBLIC_PAGES.map((path) => `  <url><loc>${site}${path}</loc></url>`);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), seoFiles(mode)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin in development too: the refresh cookie and the CSP behave like production.
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache well across deploys. A group also captures its
        // dependencies, so shared libraries get a higher priority than charts: otherwise
        // Recharts would pull Redux into its chunk and every page would preload it.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler|react-is|use-sync-external-store)[\\/]/,
              priority: 50,
            },
            {
              name: 'redux',
              test: /[\\/]node_modules[\\/](@reduxjs|react-redux|redux|redux-thunk|immer|reselect)[\\/]/,
              priority: 40,
            },
            { name: 'forms', test: /[\\/]node_modules[\\/](formik|yup)[\\/]/, priority: 30 },
            {
              name: 'motion',
              test: /[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
              priority: 30,
            },
            {
              name: 'radix',
              test: /[\\/]node_modules[\\/](@radix-ui|@floating-ui)[\\/]/,
              priority: 30,
            },
            {
              name: 'ui-utils',
              test: /[\\/]node_modules[\\/](clsx|tailwind-merge|class-variance-authority|sonner)[\\/]/,
              priority: 20,
            },
            {
              name: 'charts',
              test: /[\\/]node_modules[\\/](recharts|d3-[\w-]+|victory-vendor)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/test/**', 'src/vite-env.d.ts'],
      thresholds: { lines: 70, functions: 65, branches: 60, statements: 70 },
    },
  },
}));
