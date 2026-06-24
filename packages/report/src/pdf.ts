// @accessify/report/pdf — HTML → PDF（T302 / FR-402）
// Playwright print（Chromium-only）；離線靠映像內建完整 Noto Sans TC（避免 CJK 缺字，ADR-002）。

import { chromium, type Browser } from 'playwright';

export interface PdfOptions {
  browser?: Browser;
  chromiumSandbox?: boolean;
}

/** 將報表 HTML 轉為 PDF buffer。CJK 完整字型由執行環境（映像）提供。 */
export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const ownBrowser = !options.browser;
  const browser =
    options.browser ??
    (await chromium.launch({ headless: true, chromiumSandbox: options.chromiumSandbox ?? true }));
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
    });
  } finally {
    await context.close();
    if (ownBrowser) await browser.close();
  }
}
