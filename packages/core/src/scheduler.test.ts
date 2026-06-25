import { describe, it, expect } from 'vitest';
import { openDb, runMigrations, type Db } from './index.js';
import { dueSchedules, runSchedulerTick } from './scheduler.js';

function seed(): Db {
  const db = openDb(':memory:');
  runMigrations(db);
  return db;
}
function addSchedule(
  db: Db,
  target: string,
  opts: { interval?: number; enabled?: number; lastRunAt?: string | null; nextRunAt?: string | null } = {},
): number {
  return Number(
    db
      .prepare(
        'INSERT INTO schedules (target, type, interval_seconds, enabled, last_run_at, next_run_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(target, 'url', opts.interval ?? 3600, opts.enabled ?? 1, opts.lastRunAt ?? null, opts.nextRunAt ?? null)
      .lastInsertRowid,
  );
}

const NOW = new Date('2026-06-25T00:00:00.000Z');

describe('scheduler dueSchedules（T601）', () => {
  it('依 enabled 與相對間隔判斷到期；停用與未到期不列入', () => {
    const db = seed();
    const a = addSchedule(db, 'due.mil', { nextRunAt: '2000-01-01T00:00:00.000Z' });
    const b = addSchedule(db, 'off.mil', { enabled: 0, nextRunAt: '2000-01-01T00:00:00.000Z' });
    // last_run_at = now、interval 1h → 下次到期在 +1h，現在不到期
    const c = addSchedule(db, 'future.mil', { lastRunAt: '2026-06-25T00:00:00.000Z', interval: 3600 });
    const ids = dueSchedules(db, NOW).map((d) => d.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
    expect(ids).not.toContain(c);
  });
});

describe('scheduler runSchedulerTick（T601）', () => {
  it('到期 → 建立 queued scan_task + job，並前進視窗（同 now 不重複觸發）', () => {
    const db = seed();
    const id = addSchedule(db, 'b.mil', { nextRunAt: '2000-01-01T00:00:00.000Z' });
    const r = runSchedulerTick(db, NOW);
    expect(r.fired).toEqual([id]);
    const task = db.prepare("SELECT status FROM scan_tasks WHERE target = 'b.mil'").get() as { status: string };
    expect(task.status).toBe('queued');
    expect((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state='pending'").get() as { n: number }).n).toBe(1);
    // 第二次同 now：視窗已前進，不再觸發
    expect(runSchedulerTick(db, NOW).fired).toEqual([]);
  });

  it('防風暴：該 target 已有進行中掃描 → 跳過入列但前進視窗', () => {
    const db = seed();
    const id = addSchedule(db, 'c.mil', { nextRunAt: '2000-01-01T00:00:00.000Z' });
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES ('c.mil','url','running')").run();
    const r = runSchedulerTick(db, NOW);
    expect(r.skipped).toEqual([id]);
    expect(r.fired).toEqual([]);
    // 沒有新增第二個 task（仍只有那筆 running）
    expect((db.prepare("SELECT COUNT(*) AS n FROM scan_tasks WHERE target='c.mil'").get() as { n: number }).n).toBe(1);
    // 視窗已前進 → 下次同 now 不再到期
    expect(dueSchedules(db, NOW).map((d) => d.id)).not.toContain(id);
  });
});
