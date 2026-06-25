#!/usr/bin/env node
// 可重現 a11y 檢查（自身 WCAG 2.1 AA，ADR-005）：靜態服務 packages/web/dist → Playwright + axe-core
// 掃所有 Portal 頁面（stub /api，注入 session）。需先 `npm run build`。用法：node scripts/a11y-check.mjs
// 註：axe 0 violations 為「自動可判定」部分，非完整 AA 保證（ADR-005/007）。
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'packages/web/dist');
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
  '/api/scans': [{ id: 1, target: 'https://intra.mil/', type: 'url', status: 'completed', created_at: '2026-06-25 10:00:00' }],
  '/api/scans/1': { id: 1, target: 'https://intra.mil/', type: 'url', status: 'completed', created_at: '2026-06-25 10:00:00', issueCounts: [{ severity: 'high', count: 3 }] },
  '/api/scans/1/issues': [{ id: 1, engine: 'axe', rule_code: 'image-alt', wcag_ref: '1.1.1', severity: 'high', selector: 'img', message: 'm' }],
  '/api/scans/1/reports': [{ id: 1, lang: 'zh-TW', format: 'html', created_at: 'x' }],
  '/api/scans/1/diff': { scanTaskId: 1, baselineScanId: 5, fixed: [], added: [{ pageUrl: 'http://intra.mil/', wcagRef: '1.4.3', ruleCode: 'c', severity: 'medium', selector: '.x', message: 'm' }], unchanged: [] },
  '/api/settings': { scan_whitelist: 'intra.mil' },
  '/api/schedules': [{ id: 1, target: 'https://intra.mil/', type: 'url', interval_seconds: 86400, enabled: 1, last_run_at: null, next_run_at: '2026-06-26 10:00:00', created_at: 'x' }],
  '/api/notifications': [{ id: 1, kind: 'new_issues', scan_task_id: 1, message_key: 'notifications.msgNewIssues', params_json: JSON.stringify({ target: 'https://intra.mil/', count: 3 }), read: 0, created_at: '2026-06-25 10:00:00' }],
  '/api/notifications/unread-count': { count: 1 },
  '/api/status': { overall: 'degraded', uptimeSec: 3600, queue: { queued: 1, running: 0, failed: 1, completed: 9, oldestQueuedAgeSec: 30 }, worker: { heartbeatStaleSec: 5, staleLeases: 0 }, db: { integrity: 'ok', schemaVersion: 5 }, disk: { usedPct: 60, freeBytes: 80e9, totalBytes: 200e9 }, tls: { daysRemaining: 9 }, versions: { node: 'v22', app: '0.1.0', schema: 5 } },
};

const PAGES = [
  { label: 'Login', hash: '#/', auth: false },
  { label: 'Dashboard', hash: '#/', auth: true },
  { label: 'CreateScan', hash: '#/scans/new', auth: true },
  { label: 'ScanResult', hash: '#/scans/1', auth: true },
  { label: 'Schedules', hash: '#/schedules', auth: true },
  { label: 'Notifications', hash: '#/notifications', auth: true },
  { label: 'Settings', hash: '#/settings', auth: true },
  { label: 'Status', hash: '#/status', auth: true },
];

const browser = await chromium.launch();
let failed = 0;
for (const variant of [{ lang: 'zh-TW', dark: false }, { lang: 'en-US', dark: true }]) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([auth, lang, dark]) => {
      if (auth) { localStorage.setItem('accessify.token', 'stub'); localStorage.setItem('accessify.role', 'admin'); }
      if (lang) localStorage.setItem('accessify.lang', lang);
      if (dark) localStorage.setItem('theme', 'dark');
    }, [pg.auth, variant.lang, variant.dark]);
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUBS[path] ?? { ok: true }) });
    });
    await page.goto(base + pg.hash, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 5000 });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const tag = `${pg.label} ${variant.lang}${variant.dark ? ' dark' : ''}`;
    if (r.violations.length) {
      failed++;
      console.log(`[FAIL] ${tag}: ${r.violations.map((v) => v.id).join(', ')}`);
    } else {
      console.log(`[ok]   ${tag}`);
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log(failed === 0 ? '\nA11Y OK: 0 WCAG 2.1 AA violations across all Portal pages × zh-TW/en-US × light/dark' : `\nA11Y FAIL: ${failed} variant(s)`);
process.exit(failed === 0 ? 0 : 1);
