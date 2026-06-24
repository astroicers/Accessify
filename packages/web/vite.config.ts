import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 與後端共用同一份 i18n catalog（從 source，免先 build）。
    alias: {
      '@accessify/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 開發時把 /api 代理到本地後端（地端離線；正式由 compose 同源服務）。
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8443', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
});
