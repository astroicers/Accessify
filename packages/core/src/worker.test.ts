import { describe, it, expect } from 'vitest';
import { openDb, type Db } from './db.js';
import { runMigrations } from './migrate.js';
import { enqueueJob } from './queue.js';
import { processNextJob, runWorker } from './worker.js';

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

describe('worker runWorker 排程整合（T601）', () => {
  function freshDb(target: string): Db {
    const db = openDb(':memory:');
    runMigrations(db);
    db.prepare(
      "INSERT INTO schedules (target, type, interval_seconds, enabled, next_run_at) VALUES (?, 'url', 3600, 1, '2000-01-01T00:00:00.000Z')",
    ).run(target);
    return db;
  }

  it('schedulerTickMs>0：tick 觸發重掃並由同一迴圈處理', async () => {
    const db = freshDb('https://sched.mil/');
    let processed = 0;
    let iter = 0;
    await runWorker(
      db,
      { owner: 'w1', runJob: async () => void processed++ },
      { pollMs: 0, schedulerTickMs: 1, shouldStop: () => iter++ >= 4 },
    );
    const task = db.prepare("SELECT status FROM scan_tasks WHERE target='https://sched.mil/'").get() as
      | { status: string }
      | undefined;
    expect(task).toBeTruthy();
    expect(processed).toBeGreaterThanOrEqual(1);
  });

  it('schedulerTickMs=0：關閉排程（不建立重掃）', async () => {
    const db = freshDb('https://off.mil/');
    let iter = 0;
    await runWorker(
      db,
      { owner: 'w1', runJob: async () => {} },
      { pollMs: 0, schedulerTickMs: 0, shouldStop: () => iter++ >= 3 },
    );
    expect(db.prepare("SELECT COUNT(*) AS n FROM scan_tasks WHERE target='https://off.mil/'").get()).toEqual({ n: 0 });
  });
});
