// @accessify/scanner/scan — 逐頁掃描編排（FR-204 / ADR-009）
// 對每個目標：egress 強制渲染 → axe + HTMLCS → 整併去重；單頁失敗隔離，不拖垮整體。

import { chromium, type Browser, type Page } from 'playwright';
import { evaluate, type EgressPolicy } from './egress.js';
import { makeRouteHandler } from './render.js';
import { runAxe } from './axe.js';
import { runHtmlcs } from './htmlcs.js';
import { mergeFindings, type MergedFinding } from './findings.js';

export interface PageScanResult {
  url: string;
  ok: boolean;
  findings: MergedFinding[];
  error?: string;
}

export interface SiteScanResult {
  targets: string[];
  pages: PageScanResult[];
}

/** 對「已渲染」頁面跑兩引擎並整併（兩引擎依序注入，避免互相干擾）。 */
export async function scanRenderedPage(page: Page): Promise<MergedFinding[]> {
  const axe = await runAxe(page);
  const htmlcs = await runHtmlcs(page);
  return mergeFindings(axe, htmlcs);
}

export interface ScanUrlOptions {
  policy: EgressPolicy;
  browser?: Browser;
  navigationTimeoutMs?: number;
  chromiumSandbox?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

/** 對單一 URL：egress 強制渲染（每出站請求攔截）→ 掃描。 */
export async function scanUrl(url: string, options: ScanUrlOptions): Promise<MergedFinding[]> {
  const initial = evaluate(url, options.policy);
  if (!initial.allowed) throw new Error(`egress blocked: ${url} (${initial.reason})`);

  const ownBrowser = !options.browser;
  const browser =
    options.browser ??
    (await chromium.launch({ headless: true, chromiumSandbox: options.chromiumSandbox ?? true }));
  const context = await browser.newContext();
  const blocked: { url: string; reason: string }[] = [];
  await context.route('**/*', makeRouteHandler(options.policy, blocked) as Parameters<typeof context.route>[1]);
  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: options.waitUntil ?? 'domcontentloaded',
      timeout: options.navigationTimeoutMs ?? 15000,
    });
    const finalCheck = evaluate(page.url(), options.policy);
    if (!finalCheck.allowed) throw new Error(`egress blocked after redirect: ${page.url()}`);
    return await scanRenderedPage(page);
  } finally {
    await context.close();
    if (ownBrowser) await browser.close();
  }
}

export interface ScanSiteDeps {
  /** 對單一 URL 取得整併 findings（注入以利測試 / 重用 browser）。 */
  scanOne: (url: string) => Promise<MergedFinding[]>;
  maxPages?: number;
}

/** 逐頁編排：套用頁數上限、單頁失敗隔離，輸出結構化結果。 */
export async function scanSite(targets: string[], deps: ScanSiteDeps): Promise<SiteScanResult> {
  const limited = targets.slice(0, deps.maxPages ?? 200);
  const pages: PageScanResult[] = [];
  for (const url of limited) {
    try {
      pages.push({ url, ok: true, findings: await deps.scanOne(url) });
    } catch (e) {
      pages.push({ url, ok: false, findings: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { targets: limited, pages };
}
