import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/seed/run.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // The shared workspace package is TypeScript source, so it is bundled in;
  // everything else stays in node_modules.
  noExternal: ['@planpilot/shared'],
});
