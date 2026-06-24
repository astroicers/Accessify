import { describe, it, expect } from 'vitest';
import { openDb } from './db.js';
import { runMigrations } from './migrate.js';
import { persistScan, type PersistPage } from './persist.js';

describe('persistScan 入庫（FR-204）', () => {
  it('將逐頁掃描結果寫入 pages / issues', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const taskId = Number(
      db
        .prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://intra.mil', 'url', 'completed')")
        .run().lastInsertRowid,
    );

    const pages: PersistPage[] = [
      {
        url: 'https://intra.mil/',
        renderStatus: 'ok',
        issues: [
          {
            engine: 'axe-core',
            ruleCode: 'image-alt',
            wcagRef: '1.1.1',
            severity: 'critical',
            selector: 'img',
            message: 'Images must have alternate text',
          },
        ],
      },
      { url: 'https://intra.mil/about', renderStatus: 'ok', issues: [] },
    ];

    const result = persistScan(db, taskId, pages);
    expect(result).toEqual({ pages: 2, issues: 1 });
    expect(Number((db.prepare('SELECT COUNT(*) AS c FROM pages').get() as { c: number }).c)).toBe(2);
    expect(Number((db.prepare('SELECT COUNT(*) AS c FROM issues').get() as { c: number }).c)).toBe(1);
    const issue = db.prepare('SELECT engine, severity, selector FROM issues').get() as {
      engine: string;
      severity: string;
      selector: string;
    };
    expect(issue).toEqual({ engine: 'axe-core', severity: 'critical', selector: 'img' });
    db.close();
  });
});
