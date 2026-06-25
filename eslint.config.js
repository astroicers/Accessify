// Flat ESLint config (ESLint 9).
// i18n no-literal-string：先以 warn 套用於使用者可見層（web/api）；
// T006 收緊為 error 並接上 CI 雙語 key-diff（ADR-004）。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

export default tseslint.config(
  {
    // scripts/ 為維運 Node/Bash 腳本（非 TS 應用層）；以 shellcheck（.sh）與 node --check（.mjs）驗證。
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'scripts/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/web/src/**/*.{ts,tsx}', 'packages/api/src/**/*.ts'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { ignore: ['^@accessify/'] }],
    },
  },
);
