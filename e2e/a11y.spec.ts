import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// 本產品自身的 WCAG 2.1 AA a11y/e2e 驗收（ADR-005 / UIUX_SPEC 第 5 節 / T007）。
// 框架已備妥；Web Portal 於 M5 建立後，移除下方 skip 並針對各核心頁面驗收。
// 注意：axe 自動掃描 0 violations 僅代表「自動可判定部分」，完整 AA 仍需手動檢核清單（ADR-005）。

test.describe('Accessify Portal 自身無障礙（WCAG 2.1 AA）', () => {
  test.skip(true, 'Web Portal 於 M5（T501/T504）建立後啟用');

  test('Dashboard 無 axe violations（wcag2a/2aa/21aa，自動可判定部分）', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
