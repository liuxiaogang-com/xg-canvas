// Flat config (ESLint v9) for the file-size iron rule + ioredis import guard.
// Used by `pnpm lint:max-lines`. The repo pins ESLint v9, which dropped the
// legacy `--no-eslintrc`/`.eslintrc.cjs` path; this is the supported form.
//
// Iron rule: single file must stay <=400 lines (convention) and is NEVER
// allowed over 500 (hard error enforced here). ESLint's core max-lines can
// emit only one severity per run, so the hard 500 ceiling is the CI gate.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// This gate only enforces file size, but source carries inline eslint-disable
// directives for rules from other plugins (e.g. react-hooks/exhaustive-deps).
// Register those plugins as known (no-op) so the directives resolve instead of
// erroring. react-hooks isn't hoisted to root, so it's stubbed.
const noop = { create: () => ({}) };
const reactHooksStub = { rules: { 'exhaustive-deps': noop, 'rules-of-hooks': noop } };

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.venv/**', '**/__pycache__/**', '**/*.d.ts'],
  },
  {
    files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    // directives target rules from plugins this size-only gate keeps off; don't
    // flag them as unused.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooksStub },
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: false, skipComments: false }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'ioredis',
              message: 'Use RedisService (src/redis or src/account/redis) instead of importing ioredis directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // the redis modules are the only place allowed to construct the ioredis client
    files: ['apps/canvas-api/src/redis/**', 'apps/canvas-api/src/account/redis/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
