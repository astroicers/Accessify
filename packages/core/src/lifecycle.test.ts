import { describe, it, expect } from 'vitest';
import { openDb } from './db.js';
import { runMigrations } from './migrate.js';
import { writeAudit, setScanTaskStatus } from './lifecycle.js';

function setup() {
  const db = openDb(':memory:');
  runMigrations(db);
  const taskId = Number(
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://a', 'url', 'queued')").run()
      .lastInsertRowid,
  );
  return { db, taskId };
}

describe('狀態機 + 稽核（T402 / FR-104）', () => {
  it('writeAudit 寫入稽核日誌', () => {
    const { db } = setup();
    writeAudit(db, { action: 'auth.login', resource: 'user:1', ip: '10.0.0.1' });
    const row = db.prepare('SELECT action, resource, ip FROM audit_logs').get() as Record<string, string>;
    expect(row).toEqual({ action: 'auth.login', resource: 'user:1', ip: '10.0.0.1' });
  });

  it('setScanTaskStatus 合法轉移 queued→running→completed', () => {
    const { db, taskId } = setup();
    setScanTaskStatus(db, taskId, 'running');
    setScanTaskStatus(db, taskId, 'completed');
    expect((db.prepare('SELECT status FROM scan_tasks WHERE id=?').get(taskId) as { status: string }).status).toBe(
      'completed',
    );
  });

  it('非法轉移（completed→running）拋錯', () => {
    const { db, taskId } = setup();
    setScanTaskStatus(db, taskId, 'running');
    setScanTaskStatus(db, taskId, 'completed');
    expect(() => setScanTaskStatus(db, taskId, 'running')).toThrow(/invalid scan_task transition/);
  });
});
