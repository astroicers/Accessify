// @accessify/core/lifecycle — 任務狀態機 + 稽核日誌（T402 / FR-104）

import type { Db } from './db.js';

export type ScanTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  resource?: string | null;
  ip?: string | null;
  detail?: string | null;
}

/** 寫稽核日誌（登入、建立/刪除任務、下載報表、改設定、掃描狀態變更等）。 */
export function writeAudit(db: Db, entry: AuditEntry): void {
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, resource, ip, detail) VALUES (?, ?, ?, ?, ?)',
  ).run(entry.userId ?? null, entry.action, entry.resource ?? null, entry.ip ?? null, entry.detail ?? null);
}

const ALLOWED: Record<ScanTaskStatus, ScanTaskStatus[]> = {
  queued: ['running', 'failed'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

/** 更新掃描任務狀態（驗證合法轉移）。 */
export function setScanTaskStatus(db: Db, scanTaskId: number, next: ScanTaskStatus): void {
  const row = db.prepare('SELECT status FROM scan_tasks WHERE id=?').get(scanTaskId) as
    | { status: ScanTaskStatus }
    | undefined;
  if (!row) throw new Error(`scan_task ${scanTaskId} not found`);
  if (row.status !== next && !ALLOWED[row.status].includes(next)) {
    throw new Error(`invalid scan_task transition: ${row.status} → ${next}`);
  }
  db.prepare('UPDATE scan_tasks SET status=? WHERE id=?').run(next, scanTaskId);
}
