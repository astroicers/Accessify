import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, runMigrations } from '@accessify/core';

// 驗證 T703 備份機制核心：Online Backup API（db.backup）對使用中 WAL 庫取一致快照，
// 還原檔 quick_check 通過且資料/結構完整（scripts/db-backup.mjs / db-verify.mjs 即此機制的薄封裝）。
describe('SQLite Online Backup 一致性（T703）', () => {
  it('db.backup() → 還原檔 integrity ok、資料與 schema 完整', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'accessify-bk-'));
    const src = join(dir, 'src.db');
    const dest = join(dir, 'backup.db');

    const db = openDb(src); // WAL 模式（檔案庫）
    runMigrations(db);
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://intra.mil/','url','completed')").run();
    await db.backup(dest); // 使用中庫取一致快照
    db.close();

    const restored = openDb(dest, { readonly: true });
    try {
      expect(restored.pragma('quick_check', { simple: true })).toBe('ok');
      expect((restored.prepare('SELECT COUNT(*) AS n FROM scan_tasks').get() as { n: number }).n).toBe(1);
      expect((restored.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }).v).toBeGreaterThan(0);
    } finally {
      restored.close();
    }
  });
});
