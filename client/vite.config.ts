import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    rollupOptions: {
      output: {
        // Long-lived vendor chunks cache well across deploys; charts only load on admin pages.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
          if (/@reduxjs|react-redux|immer|reselect/.test(id)) return 'redux';
          if (/recharts|d3-|victory-vendor/.test(id)) return 'charts';
          if (/formik|[\\/]yup[\\/]/.test(id)) return 'forms';
          return undefined;
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
});
