import { describe, it, expect } from 'vitest';
import { openDb, type Db } from './db.js';
import { runMigrations } from './migrate.js';
import { enqueueJob, claimJob, heartbeat, completeJob, failJob, reclaimExpired } from './queue.js';

function setup(): { db: Db; taskId: number } {
  const db = openDb(':memory:');
  runMigrations(db);
  const taskId = Number(
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('https://a', 'url', 'queued')").run()
      .lastInsertRowid,
  );
  return { db, taskId };
}

describe('內嵌佇列（T401 / FR-206）', () => {
  it('enqueue → claim（running, attempts=1）→ 無更多則 null → complete（done）', () => {
    const { db, taskId } = setup();
    enqueueJob(db, taskId);
    const job = claimJob(db, 'w1');
    expect(job?.state).toBe('running');
    expect(job?.attempts).toBe(1);
    expect(claimJob(db, 'w1')).toBeNull();
    completeJob(db, job!.id);
    expect((db.prepare('SELECT state FROM jobs WHERE id=?').get(job!.id) as { state: string }).state).toBe('done');
  });

  it('heartbeat 延長租約（持有者）', () => {
    const { db, taskId } = setup();
    enqueueJob(db, taskId);
    const job = claimJob(db, 'w1')!;
    expect(heartbeat(db, job.id, 'w1')).toBe(true);
    expect(heartbeat(db, job.id, 'someone-else')).toBe(false);
  });

  it('failJob：未達上限退回 pending（可重試），達上限 failed', () => {
    const { db, taskId } = setup();
    enqueueJob(db, taskId);
    const job = claimJob(db, 'w1')!; // attempts=1
    expect(failJob(db, job.id, 3)).toBe('retry');
    const re = claimJob(db, 'w1')!; // attempts=2
    expect(re.attempts).toBe(2);
    failJob(db, re.id, 3); // attempts=2 < 3 → retry
    const re2 = claimJob(db, 'w1')!; // attempts=3
    expect(failJob(db, re2.id, 3)).toBe('failed');
    expect((db.prepare('SELECT state FROM jobs WHERE id=?').get(re2.id) as { state: string }).state).toBe('failed');
  });

  it('reclaimExpired 回收過期租約的 running job', () => {
    const { db, taskId } = setup();
    enqueueJob(db, taskId);
    claimJob(db, 'w1', -1000); // 立即過期
    expect(reclaimExpired(db)).toBe(1);
    const job = claimJob(db, 'w2'); // 可再被領取
    expect(job?.state).toBe('running');
  });
});
