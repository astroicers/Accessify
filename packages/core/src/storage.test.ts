import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { runMigrations } from './migrate.js';
import { saveReport } from './storage.js';

describe('報表本地儲存（T403 / FR-404）', () => {
  it('saveReport 寫入檔案並登錄 reports 表', () => {
    const dir = mkdtempSync(join(tmpdir(), 'accessify-rep-'));
    try {
      const db = openDb(':memory:');
      runMigrations(db);
      const taskId = Number(
        db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://a', 'url', 'completed')").run()
          .lastInsertRowid,
      );

      const path = saveReport(db, {
        baseDir: dir,
        scanTaskId: taskId,
        lang: 'zh-TW',
        format: 'html',
        content: '<html>報表</html>',
      });

      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, 'utf8')).toContain('報表');
      const row = db.prepare('SELECT lang, format, path FROM reports').get() as Record<string, string>;
      expect(row.lang).toBe('zh-TW');
      expect(row.format).toBe('html');
      expect(row.path).toBe(path);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
