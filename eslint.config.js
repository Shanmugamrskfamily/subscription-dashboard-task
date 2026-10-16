import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'server/**/*.ts',
      'shared/**/*.ts',
      'scripts/**/*.{js,mjs}',
      'e2e/**/*.ts',
      '*.{js,mjs,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'server/src/seed/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat['recommended-latest']],
    rules: {
      // React escapes text by default; raw HTML injection is the classic XSS hole, so it is banned.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Raw HTML injection is not allowed (XSS risk). Render text instead.',
        },
      ],
    },
  },
]);
