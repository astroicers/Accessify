#!/usr/bin/env node
// 開發/驗證用：對單一 URL 跑完整掃描管線（scanner → mapping → 雙語六報表）。需先 `npm run build`。
// ⚠ 僅供開發/release 驗證——正式部署為地端離線，掃描受 DB scan_whitelist + egress 把關。
// 用法：node scripts/scan-url.mjs <url> [whitelist-csv]
//   例：node scripts/scan-url.mjs https://github.com/ github.com,githubassets.com,githubusercontent.com
import { chromium } from 'playwright';
import { openDb, runMigrations } from '@accessify/core';
import { scanUrl } from '@accessify/scanner';
import { buildReports } from '@accessify/worker';
import { htmlToPdf } from '@accessify/report';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/scan-url.mjs <url> [whitelist-csv]');
  process.exit(1);
}
const host = new URL(target).hostname;
const whitelist = (process.argv[3] ?? host).split(',').map((s) => s.trim()).filter(Boolean);
const policy = { whitelist };

const db = openDb(':memory:');
runMigrations(db);
const taskId = Number(
  db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES (?, 'url', 'running')").run(target).lastInsertRowid,
);
const dir = mkdtempSync(join(tmpdir(), 'accessify-scan-'));
const browser = await chromium.launch({ headless: true, chromiumSandbox: false });

console.log(`[scan] ${target}  (whitelist: ${whitelist.join(', ')})`);
let findings;
try {
  findings = await scanUrl(target, { policy, browser, navigationTimeoutMs: 30000, waitUntil: 'domcontentloaded' });
} catch (e) {
  console.error('[scan] FAILED:', e instanceof Error ? e.message : String(e));
  await browser.close();
  process.exit(2);
}

const byEngine = {};
for (const f of findings) {
  const k = f.engines.join('+');
  byEngine[k] = (byEngine[k] ?? 0) + 1;
}
console.log(`[scan] merged findings: ${findings.length}  by engine: ${JSON.stringify(byEngine)}`);

const site = { targets: [target], pages: [{ url: target, ok: true, findings }] };
const res = await buildReports(db, taskId, target, site, {
  reportsBaseDir: dir,
  toPdf: (h) => htmlToPdf(h, { browser, chromiumSandbox: false }),
  generatedAt: new Date().toISOString(),
});
await browser.close();

console.log(`[report] ${JSON.stringify(res)}  severity: ${JSON.stringify(db.prepare('SELECT severity, COUNT(*) n FROM issues GROUP BY severity ORDER BY n DESC').all())}`);
console.log(`[report] files: ${readdirSync(join(dir, String(taskId))).join(', ')}`);
const pdf = readFileSync(join(dir, String(taskId), 'report-zh-TW.pdf'));
console.log(`[report] zh-TW PDF: ${pdf.subarray(0, 5).toString()} ${pdf.length} bytes`);
console.log(`[report] dir: ${join(dir, String(taskId))}`);
