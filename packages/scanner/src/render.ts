// @accessify/scanner/render — Playwright headless 渲染封裝（ADR-009 / FR-201）
// 每個出站請求經 route 攔截以 egress 政策校驗；redirect 最終 URL 再校驗；含資源上限。

import { chromium, type Browser } from 'playwright';
import { evaluate, type EgressPolicy } from './egress.js';

export interface BlockedRequest {
  url: string;
  reason: string;
}

export interface RenderOptions {
  policy: EgressPolicy;
  /** 每頁 navigation timeout（毫秒）。 */
  navigationTimeoutMs?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** 容器內依 ADR-009 應保留 sandbox；非 root 測試環境可關閉。 */
  chromiumSandbox?: boolean;
  /** 注入既有 browser（重用，避免每頁啟動）。 */
  browser?: Browser;
}

export interface RenderResult {
  finalUrl: string;
  html: string;
  blockedRequests: BlockedRequest[];
}

export interface RouteLike {
  request(): { url(): string };
  continue(): unknown;
  abort(errorCode?: string): unknown;
}

/**
 * 建立 route 攔截處理器：對每個出站請求套用 egress 政策。
 * 抽出為純函式以便不啟動瀏覽器即可單元測試（ADR-009 出站強制的核心）。
 */
export function makeRouteHandler(policy: EgressPolicy, blocked: BlockedRequest[]) {
  return (route: RouteLike): void => {
    const reqUrl = route.request().url();
    const decision = evaluate(reqUrl, policy);
    if (decision.allowed) {
      void route.continue();
    } else {
      blocked.push({ url: reqUrl, reason: decision.reason ?? 'blocked' });
      void route.abort('blockedbyclient');
    }
  };
}

/** 以 headless Chromium 渲染單一頁面，全程強制 egress 政策與資源上限。 */
export async function renderPage(url: string, options: RenderOptions): Promise<RenderResult> {
  const initial = evaluate(url, options.policy);
  if (!initial.allowed) {
    throw new Error(`egress blocked: ${url} (${initial.reason})`);
  }

  const ownBrowser = !options.browser;
  const browser =
    options.browser ??
    (await chromium.launch({ headless: true, chromiumSandbox: options.chromiumSandbox ?? true }));
  const context = await browser.newContext();
  const blocked: BlockedRequest[] = [];
  await context.route('**/*', makeRouteHandler(options.policy, blocked) as Parameters<typeof context.route>[1]);

  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: options.waitUntil ?? 'domcontentloaded',
      timeout: options.navigationTimeoutMs ?? 15000,
    });
    const finalUrl = page.url();
    const finalCheck = evaluate(finalUrl, options.policy);
    if (!finalCheck.allowed) {
      throw new Error(`egress blocked after redirect: ${finalUrl} (${finalCheck.reason})`);
    }
    const html = await page.content();
    return { finalUrl, html, blockedRequests: blocked };
  } finally {
    await context.close();
    if (ownBrowser) await browser.close();
  }
}
