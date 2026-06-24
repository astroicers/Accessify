import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolveSrc = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // 測試時將 workspace 套件解析到 src（免先 build，跨套件即時生效）。
  resolve: {
    alias: {
      '@accessify/shared': resolveSrc('./packages/shared/src/index.ts'),
      '@accessify/core': resolveSrc('./packages/core/src/index.ts'),
      '@accessify/scanner': resolveSrc('./packages/scanner/src/index.ts'),
      '@accessify/mapping': resolveSrc('./packages/mapping/src/index.ts'),
      '@accessify/report': resolveSrc('./packages/report/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});
