import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, runMigrations, type Db } from '@accessify/core';
import type { SiteScanResult } from '@accessify/scanner';
import { buildReports } from './reports.js';

function seed(): { db: Db; taskId: number; dir: string } {
  const db = openDb(':memory:');
  runMigrations(db);
  const taskId = Number(
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://intra.mil/','url','running')").run().lastInsertRowid,
  );
  return { db, taskId, dir: mkdtempSync(join(tmpdir(), 'accessify-rep-')) };
}

const site: SiteScanResult = {
  targets: ['https://intra.mil/'],
  pages: [
    {
      url: 'https://intra.mil/',
      ok: true,
      findings: [
        { engine: 'axe-core', ruleId: 'image-alt', impact: 'critical', wcagTags: ['wcag2a', 'wcag111'], selector: 'img.logo', message: 'Image missing alt', engines: ['axe-core'] },
        { engine: 'htmlcs', ruleId: 'label', impact: null, wcagTags: ['wcag2a', 'wcag131'], selector: 'input#q', message: 'Field missing label', engines: ['htmlcs'] },
      ],
    },
  ],
};

describe('buildReports（M7 / runJob 組裝）', () => {
  it('入庫 pages/issues + 產出 zh-TW/en-US × html/pdf/xlsx 六報表並寫檔', async () => {
    const { db, taskId, dir } = seed();
    let pdfCalls = 0;
    const res = await buildReports(db, taskId, 'https://intra.mil/', site, {
      reportsBaseDir: dir,
      toPdf: async (html) => {
        pdfCalls++;
        expect(html).toContain('<');
        return Buffer.from('%PDF-1.4 fake');
      },
      generatedAt: '2026-06-25T00:00:00.000Z',
    });
    expect(res).toMatchObject({ pages: 1, issues: 2, reports: 6 });
    expect(pdfCalls).toBe(2); // zh-TW + en-US

    const rows = db.prepare('SELECT lang, format FROM reports WHERE scan_task_id = ? ORDER BY lang, format').all(taskId);
    expect(rows.length).toBe(6);

    const issue = db.prepare('SELECT engine, wcag_ref, severity FROM issues ORDER BY id LIMIT 1').get() as {
      engine: string;
      wcag_ref: string | null;
      severity: string;
    };
    expect(issue.engine).toBe('axe-core');
    expect(issue.wcag_ref).toBe('1.1.1');
    expect(['critical', 'high', 'medium', 'low', 'hint']).toContain(issue.severity);

    expect(existsSync(join(dir, String(taskId), 'report-zh-TW.html'))).toBe(true);
    expect(existsSync(join(dir, String(taskId), 'report-en-US.pdf'))).toBe(true);
  });
});
