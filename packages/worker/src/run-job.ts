// @accessify/worker/run-job — 生產 runJob 工廠：串接 scanner→mapping→report→core。
// 注入進 core.runWorker 的 deps.runJob。worker.processNextJob 負責狀態/稽核/通知；
// 本函式只做 scan→入庫→報表，並在致命錯誤時 throw（單頁失敗由 scanSite 隔離）。

import { chromium } from 'playwright';
import type { Db } from '@accessify/core';
import {
  scanUrl,
  scanSite,
  buildTargets,
  evaluate,
  makeRouteHandler,
  type EgressPolicy,
  type BlockedRequest,
} from '@accessify/scanner';
import { htmlToPdf } from '@accessify/report';
import { buildReports } from './reports.js';

export interface RunJobOptions {
  reportsBaseDir: string;
  navigationTimeoutMs?: number;
  maxPages?: number;
  chromiumSandbox?: boolean;
  /** 注入 generatedAt（測試用）；預設 new Date().toISOString()。 */
  now?: () => string;
}

function getWhitelist(db: Db): string[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'scan_whitelist'").get() as
    | { value: string }
    | undefined;
  return row ? row.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** 取 sitemap：透過共用 browser 以 egress 攔截載入，取「原始回應本文」（非渲染 DOM）解析 <loc>。 */
async function fetchSitemapTargets(
  browser: import('playwright').Browser,
  url: string,
  policy: EgressPolicy,
  navigationTimeoutMs: number,
  maxPages: number,
): Promise<string[]> {
  const initial = evaluate(url, policy);
  if (!initial.allowed) throw new Error(`egress blocked: ${url} (${initial.reason})`);
  const context = await browser.newContext();
  const blocked: BlockedRequest[] = [];
  await context.route('**/*', makeRouteHandler(policy, blocked) as Parameters<typeof context.route>[1]);
  const page = await context.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
    const finalCheck = evaluate(page.url(), policy);
    if (!finalCheck.allowed) throw new Error(`egress blocked after redirect: ${page.url()}`);
    const xml = resp ? await resp.text() : '';
    return buildTargets({ type: 'sitemap', sitemapXml: xml }, maxPages);
  } finally {
    await context.close();
  }
}

/** 建立注入 core.runWorker 的 runJob(scanTaskId)。每個 job 啟動一個共用 browser，結束關閉。 */
export function makeRunJob(db: Db, opts: RunJobOptions): (scanTaskId: number) => Promise<void> {
  const navigationTimeoutMs = opts.navigationTimeoutMs ?? 15000;
  const maxPages = opts.maxPages ?? 200;
  const chromiumSandbox = opts.chromiumSandbox ?? true;

  return async (scanTaskId: number): Promise<void> => {
    const task = db.prepare('SELECT target, type FROM scan_tasks WHERE id = ?').get(scanTaskId) as
      | { target: string; type: 'url' | 'sitemap' }
      | undefined;
    if (!task) throw new Error(`scan_task ${scanTaskId} not found`);

    const policy: EgressPolicy = { whitelist: getWhitelist(db) };
    const browser = await chromium.launch({ headless: true, chromiumSandbox });
    try {
      const targets =
        task.type === 'sitemap'
          ? await fetchSitemapTargets(browser, task.target, policy, navigationTimeoutMs, maxPages)
          : buildTargets({ type: 'url', value: task.target }, maxPages);

      const site = await scanSite(targets, {
        maxPages,
        scanOne: (url) => scanUrl(url, { policy, browser, navigationTimeoutMs, chromiumSandbox }),
      });

      await buildReports(db, scanTaskId, task.target, site, {
        reportsBaseDir: opts.reportsBaseDir,
        toPdf: (html) => htmlToPdf(html, { browser, chromiumSandbox }),
        generatedAt: opts.now ? opts.now() : new Date().toISOString(),
      });
    } finally {
      await browser.close();
    }
  };
}
