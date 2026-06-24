// @accessify/core/queue — SQLite 內嵌佇列（ADR-003 / FR-206）
// 單一 worker 領取；lease/heartbeat 續接；過期租約可回收（孤兒任務復原）。

import type { Db } from './db.js';

export interface Job {
  id: number;
  scanTaskId: number;
  state: string;
  attempts: number;
}

const nowIso = (): string => new Date().toISOString();
const offsetIso = (ms: number): string => new Date(Date.now() + ms).toISOString();

/** 入列：為掃描任務建立 pending job。 */
export function enqueueJob(db: Db, scanTaskId: number): number {
  const info = db.prepare("INSERT INTO jobs (scan_task_id, state) VALUES (?, 'pending')").run(scanTaskId);
  return Number(info.lastInsertRowid);
}

/** 原子領取一個 pending 或「租約已過期的 running」job，設為 running + 新租約 + attempts+1。 */
export function claimJob(db: Db, owner: string, leaseMs = 60_000): Job | null {
  const claim = db.transaction((): Job | null => {
    const row = db
      .prepare(
        `SELECT id, scan_task_id AS scanTaskId, attempts FROM jobs
         WHERE state = 'pending' OR (state = 'running' AND lease_expires_at < ?)
         ORDER BY id LIMIT 1`,
      )
      .get(nowIso()) as { id: number; scanTaskId: number; attempts: number } | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE jobs SET state='running', lease_owner=?, lease_expires_at=?, heartbeat_at=?, attempts=attempts+1
       WHERE id=?`,
    ).run(owner, offsetIso(leaseMs), nowIso(), row.id);
    return { id: row.id, scanTaskId: row.scanTaskId, state: 'running', attempts: row.attempts + 1 };
  });
  return claim();
}

/** 心跳：延長租約（僅限持有者且仍 running）。回傳是否成功。 */
export function heartbeat(db: Db, jobId: number, owner: string, leaseMs = 60_000): boolean {
  const info = db
    .prepare(
      `UPDATE jobs SET heartbeat_at=?, lease_expires_at=? WHERE id=? AND lease_owner=? AND state='running'`,
    )
    .run(nowIso(), offsetIso(leaseMs), jobId, owner);
  return info.changes > 0;
}

/** 完成：設為 done、清除租約。 */
export function completeJob(db: Db, jobId: number): void {
  db.prepare("UPDATE jobs SET state='done', lease_owner=NULL, lease_expires_at=NULL WHERE id=?").run(jobId);
}

/** 失敗處理：未達上限 → 退回 pending（可重試）；達上限 → failed。 */
export function failJob(db: Db, jobId: number, maxAttempts = 3): 'retry' | 'failed' {
  const row = db.prepare('SELECT attempts FROM jobs WHERE id=?').get(jobId) as
    | { attempts: number }
    | undefined;
  const attempts = row?.attempts ?? 0;
  const outcome = attempts >= maxAttempts ? 'failed' : 'retry';
  const nextState = outcome === 'failed' ? 'failed' : 'pending';
  db.prepare('UPDATE jobs SET state=?, lease_owner=NULL, lease_expires_at=NULL WHERE id=?').run(
    nextState,
    jobId,
  );
  return outcome;
}

/** 回收過期租約的 running job（worker 崩潰/逾時 → 復原為 pending）。回傳回收數。 */
export function reclaimExpired(db: Db): number {
  const info = db
    .prepare(
      `UPDATE jobs SET state='pending', lease_owner=NULL, lease_expires_at=NULL
       WHERE state='running' AND lease_expires_at < ?`,
    )
    .run(nowIso());
  return info.changes;
}
