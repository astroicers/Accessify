// @accessify/core/scheduler — 週期重掃排程（T601 / ADR-010）
// DB 驅動輪詢、相對間隔（不依外網時鐘）。due 判斷以 julianday() 數值比較，避免
// SQLite datetime()（空白格式）與 JS toISOString()（'T'…'Z' 格式）字串混比的格式陷阱。
// 時鐘以參數注入（now: Date），純函式可單元測試；無任何對外網路。

import type { Db } from './db.js';
import { enqueueJob } from './queue.js';
import { writeAudit } from './lifecycle.js';

export interface DueSchedule {
  id: number;
  target: string;
  type: 'url' | 'sitemap';
  intervalSeconds: number;
  createdBy: number | null;
}

export interface SchedulerTickResult {
  /** 觸發了重掃的排程 id。 */
  fired: number[];
  /** 已到期但因該 target 已有進行中掃描而跳過（防 enqueue 風暴），排程仍前進。 */
  skipped: number[];
}

// next_run_at 為到期判斷的唯一真相（建立時設 now+interval；每次觸發前進 now+interval；
// PUT 改間隔亦重算）。如此 UI 顯示的「下次執行」與排程實際行為一致，並對齊 idx_schedules_due 索引。
// 以 julianday() 數值比較，規避 ISO-T 與 datetime() 空白格式字串混比的陷阱。
const DUE_PREDICATE = 'enabled = 1 AND next_run_at IS NOT NULL AND julianday(next_run_at) <= julianday(?)';

/** 目前到期、應觸發重掃的排程。 */
export function dueSchedules(db: Db, now: Date): DueSchedule[] {
  return db
    .prepare(
      `SELECT id, target, type, interval_seconds AS intervalSeconds, created_by AS createdBy
       FROM schedules WHERE ${DUE_PREDICATE} ORDER BY id`,
    )
    .all(now.toISOString()) as DueSchedule[];
}

/**
 * 執行一次排程 tick：對每個到期排程「原子認領」當前視窗（防跨 tick/程序重複觸發），
 * 前進 last_run_at / next_run_at；若該 target 已有 queued/running 掃描則跳過入列（防風暴）。
 * 不做 catch-up backfill（一個視窗至多觸發一次，容忍時鐘回跳，ADR-010）。
 */
export function runSchedulerTick(db: Db, now: Date): SchedulerTickResult {
  const nowIso = now.toISOString();
  const fired: number[] = [];
  const skipped: number[] = [];

  const claim = db.prepare(
    `UPDATE schedules
     SET last_run_at = ?, next_run_at = ?
     WHERE id = ? AND ${DUE_PREDICATE}`,
  );
  const findActive = db.prepare(
    "SELECT 1 FROM scan_tasks WHERE target = ? AND status IN ('queued','running') LIMIT 1",
  );
  const insertTask = db.prepare(
    "INSERT INTO scan_tasks (target, type, status, created_by) VALUES (?, ?, 'queued', ?)",
  );

  for (const s of dueSchedules(db, now)) {
    const nextIso = new Date(now.getTime() + s.intervalSeconds * 1000).toISOString();
    const outcome = db.transaction(() => {
      // 原子認領：僅在此視窗仍到期時前進（兩個 tick 不會雙重觸發）。
      const res = claim.run(nowIso, nextIso, s.id, nowIso);
      if (res.changes === 0) return 'lost';
      // 防風暴：同 target 已有進行中掃描 → 跳過入列，但視窗已認領（不會立刻再觸發）。
      if (findActive.get(s.target)) return 'skipped';
      const taskId = Number(insertTask.run(s.target, s.type, s.createdBy).lastInsertRowid);
      enqueueJob(db, taskId);
      writeAudit(db, {
        userId: s.createdBy,
        action: 'schedule.fire',
        resource: `schedule:${s.id}`,
        detail: `scan_task:${taskId}`,
      });
      return 'fired';
    })();
    if (outcome === 'fired') fired.push(s.id);
    else if (outcome === 'skipped') skipped.push(s.id);
  }
  return { fired, skipped };
}
