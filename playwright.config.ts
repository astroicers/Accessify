import { defineConfig, devices } from '@playwright/test';

// 本產品自身的 a11y/e2e 測試框架（ADR-005 / T007）。
// 實際頁面驗收於 M5（Web Portal）啟用；瀏覽器二進位以 `npx playwright install chromium` 取得（離線由映像層內建）。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8443',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
