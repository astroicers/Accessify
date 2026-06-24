import { describe, it, expect } from 'vitest';
import { openDb, type Db } from './db.js';
import { runMigrations } from './migrate.js';
import { enqueueJob } from './queue.js';
import { processNextJob } from './worker.js';

function setup(): { db: Db; taskId: number } {
  const db = openDb(':memory:');
  runMigrations(db);
  const taskId = Number(
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://a', 'url', 'queued')").run()
      .lastInsertRowid,
  );
  enqueueJob(db, taskId);
  return { db, taskId };
}

const status = (db: Db, taskId: number): string =>
  (db.prepare('SELECT status FROM scan_tasks WHERE id=?').get(taskId) as { status: string }).status;

describe('worker processNextJob（T401/T402）', () => {
  it('成功：job done、scan_task completed、寫稽核', async () => {
    const { db, taskId } = setup();
    let ran = 0;
    const r = await processNextJob(db, { owner: 'w1', runJob: async () => void ran++ });
    expect(r.ok).toBe(true);
    expect(ran).toBe(1);
    expect(status(db, taskId)).toBe('completed');
    const audit = db.prepare("SELECT action FROM audit_logs WHERE action='scan.completed'").get();
    expect(audit).toBeTruthy();
  });

  it('無工作時不處理', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    expect(await processNextJob(db, { owner: 'w1', runJob: async () => {} })).toEqual({ processed: false });
  });

  it('失敗達上限：scan_task failed、稽核 scan.failed', async () => {
    const { db, taskId } = setup();
    const r = await processNextJob(db, {
      owner: 'w1',
      maxAttempts: 1,
      runJob: async () => {
        throw new Error('render timeout');
      },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('render timeout');
    expect(status(db, taskId)).toBe('failed');
    expect(db.prepare("SELECT action FROM audit_logs WHERE action='scan.failed'").get()).toBeTruthy();
  });

  it('失敗未達上限：可重試（scan_task 維持 running）', async () => {
    const { db, taskId } = setup();
    const r = await processNextJob(db, {
      owner: 'w1',
      maxAttempts: 3,
      runJob: async () => {
        throw new Error('transient');
      },
    });
    expect(r.ok).toBe(false);
    expect(status(db, taskId)).toBe('running');
    // job 退回 pending，可再領
    const r2 = await processNextJob(db, { owner: 'w1', runJob: async () => {} });
    expect(r2.ok).toBe(true);
  });
});
