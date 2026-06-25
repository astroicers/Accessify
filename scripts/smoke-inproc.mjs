#!/usr/bin/env node
// In-proc 端到端 smoke（T704 可重現驗收）：真實 Chromium 掃 fixture → 對應/入庫 → 雙語六報表（含中文 PDF）→
// 同任務重跑驗證冪等。需先 `npm run build`（tsc -b）。用法：node scripts/smoke-inproc.mjs
import { chromium } from 'playwright';
import { openDb, runMigrations } from '@accessify/core';
import { runAxe, runHtmlcs, mergeFindings } from '@accessify/scanner';
import { buildReports } from '@accessify/worker';
import { htmlToPdf } from '@accessify/report';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = readFileSync(join(ROOT, 'test/fixtures/with-violations.html'), 'utf8');
const db = openDb(':memory:');
runMigrations(db);
const taskId = Number(
  db.prepare("INSERT INTO scan_tasks (target,type,status) VALUES ('https://intra.mil/','url','running')").run().lastInsertRowid,
);
const dir = mkdtempSync(join(tmpdir(), 'accessify-smoke-'));

const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
const page = await (await browser.newContext()).newPage();
await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
const findings = mergeFindings(await runAxe(page), await runHtmlcs(page));
const site = { targets: ['https://intra.mil/'], pages: [{ url: 'https://intra.mil/', ok: true, findings }] };
const opts = {
  reportsBaseDir: dir,
  toPdf: (h) => htmlToPdf(h, { browser, chromiumSandbox: false }),
  generatedAt: '2026-06-25T00:00:00.000Z',
};
const r1 = await buildReports(db, taskId, 'https://intra.mil/', site, opts);
const r2 = await buildReports(db, taskId, 'https://intra.mil/', site, opts); // 重跑：模擬 retry
await browser.close();

const pdf = readFileSync(join(dir, String(taskId), 'report-zh-TW.pdf'));
const okPdf = pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000;
const dbReports = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n;
const dbIssues = db.prepare('SELECT COUNT(*) AS n FROM issues').get().n;
const dbPages = db.prepare('SELECT COUNT(*) AS n FROM pages').get().n;
const all6 = ['zh-TW', 'en-US'].flatMap((l) => ['html', 'pdf', 'xlsx'].map((f) => join(dir, String(taskId), `report-${l}.${f}`))).every(existsSync);

console.log(`findings=${findings.length} run1=${JSON.stringify(r1)} run2=${JSON.stringify(r2)}`);
console.log(`DB pages/issues/reports=${dbPages}/${dbIssues}/${dbReports} zh-TW PDF=${okPdf?'ok':'BAD'}(${pdf.length}B) all6=${all6}`);
const pass = r1.reports === 6 && r1.issues > 0 && okPdf && all6 && dbReports === 6 && dbPages === 1 && dbIssues === r1.issues;
console.log(pass ? 'SMOKE OK: e2e + CJK PDF + idempotent re-run' : 'SMOKE FAIL');
process.exit(pass ? 0 : 1);
