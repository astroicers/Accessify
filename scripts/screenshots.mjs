#!/usr/bin/env node
// Portal 各頁截圖產生器（UI 存在的視覺證據）。複用 a11y-check.mjs 的靜態服務 + /api stub + 注入登入態。
// 輸出：docs/screenshots/NN-<page>.<lang>[.dark].png。需先 `npm run build`。用法：node scripts/screenshots.mjs
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'packages/web/dist');
const OUT = join(ROOT, 'docs/screenshots');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = join(DIST, p);
  const t = existsSync(f) ? f : join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(t)] ?? 'text/html' });
  res.end(readFileSync(t));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const STUBS = {
  '/api/scans': [
    { id: 1, target: 'https://intra.mil/', type: 'url', status: 'completed', created_at: '2026-06-25 10:00:00' },
    { id: 2, target: 'https://portal.intra.mil/', type: 'url', status: 'running', created_at: '2026-06-25 11:20:00' },
  ],
  '/api/scans/1': { id: 1, target: 'https://intra.mil/', type: 'url', status: 'completed', created_at: '2026-06-25 10:00:00', score: 78, coveragePct: 27, issueCounts: [{ severity: 'high', count: 3 }, { severity: 'medium', count: 5 }, { severity: 'low', count: 2 }] },
  '/api/scans/1/issues': [
    { id: 1, engine: 'axe', rule_code: 'image-alt', wcag_ref: '1.1.1', severity: 'high', selector: 'header img.logo', message: '影像缺少替代文字（alt），螢幕報讀軟體無法描述其內容。請補上能傳達意義的 alt；純裝飾圖則設為空 alt。' },
    { id: 2, engine: 'htmlcs', rule_code: 'WCAG2AA.Principle1.Guideline1_4.1_4_3.G18', wcag_ref: '1.4.3', severity: 'medium', selector: 'a.nav-link', message: '文字與背景對比不足，低視力使用者不易辨識。請確保一般文字對比達 4.5:1（大型文字 3:1）。' },
    { id: 3, engine: 'axe', rule_code: 'button-name', wcag_ref: '4.1.2', severity: 'high', selector: 'button.icon', message: '按鈕沒有可由輔助技術辨識的名稱。請提供可見文字或 aria-label。' },
  ],
  '/api/scans/1/reports': [
    { id: 1, lang: 'zh-TW', format: 'html', created_at: '2026-06-25 10:05:00' },
    { id: 2, lang: 'zh-TW', format: 'pdf', created_at: '2026-06-25 10:05:00' },
    { id: 3, lang: 'zh-TW', format: 'xlsx', created_at: '2026-06-25 10:05:00' },
    { id: 4, lang: 'en-US', format: 'html', created_at: '2026-06-25 10:05:00' },
    { id: 5, lang: 'en-US', format: 'pdf', created_at: '2026-06-25 10:05:00' },
    { id: 6, lang: 'en-US', format: 'xlsx', created_at: '2026-06-25 10:05:00' },
  ],
  '/api/scans/1/diff': { scanTaskId: 1, baselineScanId: 5, fixed: [{ pageUrl: 'http://intra.mil/', wcagRef: '1.1.1', ruleCode: 'image-alt', severity: 'high', selector: 'img.banner', message: '已修復' }], added: [{ pageUrl: 'http://intra.mil/', wcagRef: '1.4.3', ruleCode: 'color-contrast', severity: 'medium', selector: '.x', message: '新增問題' }], unchanged: [{ pageUrl: 'http://intra.mil/', wcagRef: '4.1.2', ruleCode: 'button-name', severity: 'high', selector: 'button', message: '未改' }] },
  '/api/settings': { scan_whitelist: 'intra.mil,portal.intra.mil' },
  '/api/schedules': [
    { id: 1, target: 'https://intra.mil/', type: 'url', interval_seconds: 86400, enabled: 1, last_run_at: '2026-06-24 10:00:00', next_run_at: '2026-06-26 10:00:00', created_at: 'x' },
    { id: 2, target: 'https://portal.intra.mil/', type: 'url', interval_seconds: 604800, enabled: 0, last_run_at: null, next_run_at: null, created_at: 'x' },
  ],
  '/api/notifications': [
    { id: 1, kind: 'new_issues', scan_task_id: 1, message_key: 'notifications.msgNewIssues', params_json: JSON.stringify({ target: 'https://intra.mil/', count: 3 }), read: 0, created_at: '2026-06-25 10:00:00' },
    { id: 2, kind: 'scan_failed', scan_task_id: 2, message_key: 'notifications.msgScanFailed', params_json: JSON.stringify({ target: 'https://portal.intra.mil/' }), read: 1, created_at: '2026-06-24 09:00:00' },
  ],
  '/api/notifications/unread-count': { count: 1 },
  '/api/status': { overall: 'degraded', uptimeSec: 3600, queue: { queued: 1, running: 0, failed: 1, completed: 9, oldestQueuedAgeSec: 30 }, worker: { heartbeatStaleSec: 5, staleLeases: 0 }, db: { integrity: 'ok', schemaVersion: 5 }, disk: { usedPct: 60, freeBytes: 80e9, totalBytes: 200e9 }, tls: { daysRemaining: 9 }, versions: { node: 'v22.x', app: '1.0.0', schema: 5 } },
};

const PAGES = [
  { label: 'login', hash: '#/', auth: false },
  { label: 'dashboard', hash: '#/', auth: true },
  { label: 'create-scan', hash: '#/scans/new', auth: true },
  { label: 'scan-result', hash: '#/scans/1', auth: true },
  { label: 'schedules', hash: '#/schedules', auth: true },
  { label: 'notifications', hash: '#/notifications', auth: true },
  { label: 'settings', hash: '#/settings', auth: true },
  { label: 'status', hash: '#/status', auth: true },
];

const browser = await chromium.launch();
let n = 0;
const made = [];
for (const variant of [{ lang: 'zh-TW', dark: false }, { lang: 'en-US', dark: true }]) {
  for (const pg of PAGES) {
    n++;
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: variant.dark ? 'dark' : 'light',
      reducedMotion: 'reduce', // 對齊產品 prefers-reduced-motion 規格，並避免動畫中途截圖
    });
    await ctx.addInitScript(([auth, lang, dark]) => {
      if (auth) { localStorage.setItem('accessify.token', 'stub'); localStorage.setItem('accessify.role', 'admin'); }
      if (lang) localStorage.setItem('accessify.lang', lang);
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [pg.auth, variant.lang, variant.dark]);
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUBS[path] ?? { ok: true }) });
    });
    await page.goto(base + pg.hash, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    const name = `${String(n).padStart(2, '0')}-${pg.label}.${variant.lang}${variant.dark ? '.dark' : ''}.png`;
    const out = join(OUT, name);
    await page.screenshot({ path: out, fullPage: true });
    made.push(name);
    console.log(`[shot] ${name}`);
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(`\nDONE: ${made.length} screenshots → docs/screenshots/`);
