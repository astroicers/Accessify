import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, runMigrations, saveReport, type Db } from './index.js';
import { runRetention } from './retention.js';

function addScan(db: Db, status: string, createdAt?: string): number {
  if (createdAt) {
    return Number(
      db.prepare("INSERT INTO scan_tasks (target, type, status, created_at) VALUES ('https://intra.mil/','url',?,?)").run(status, createdAt).lastInsertRowid,
    );
  }
  return Number(
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://intra.mil/','url',?)").run(status).lastInsertRowid,
  );
}

describe('runRetention（T705 / 資料保留）', () => {
  it('刪逾期 completed（含報表檔）；保留 recent 與 running/queued', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const dir = mkdtempSync(join(tmpdir(), 'accessify-ret-'));

    const oldDone = addScan(db, 'completed', '2020-01-01 00:00:00');
    saveReport(db, { baseDir: dir, scanTaskId: oldDone, lang: 'zh-TW', format: 'html', content: '<x>' });
    const recentDone = addScan(db, 'completed'); // now
    const oldRunning = addScan(db, 'running', '2020-01-01 00:00:00'); // 未結束 → 不刪

    expect(existsSync(join(dir, String(oldDone)))).toBe(true);

    const r = runRetention(db, { retentionDays: 30, reportsBaseDir: dir, now: new Date('2026-06-25T00:00:00.000Z') });

    expect(r.deletedScans).toBe(1);
    const ids = (db.prepare('SELECT id FROM scan_tasks ORDER BY id').all() as { id: number }[]).map((x) => x.id);
    expect(ids).toEqual([recentDone, oldRunning]);
    expect(existsSync(join(dir, String(oldDone)))).toBe(false); // 報表檔目錄已清

    // 停用（retentionDays<=0）→ 不刪
    expect(runRetention(db, { retentionDays: 0, reportsBaseDir: dir }).deletedScans).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM scan_tasks').get() as { n: number }).n).toBe(2);
  });
});
