// @accessify/core/worker — 背景 worker 迴圈（T401/T402；依賴注入，與 scanner/report 解耦）

import type { Db } from './db.js';
import { claimJob, completeJob, failJob } from './queue.js';
import { setScanTaskStatus, writeAudit } from './lifecycle.js';
import { runSchedulerTick } from './scheduler.js';
import { notify } from './notifications.js';
import { computeDiff } from './diff.js';

// 掃描結束時對發起者（scan_task.created_by）建立站內通知（T603）。盡力而為、fault-isolated，
// 通知失敗絕不影響 job 結果。created_by 為 null（如系統/測試）則略過。
function notifyScanOutcome(db: Db, scanTaskId: number, outcome: 'completed' | 'failed'): void {
  try {
    const meta = db
      .prepare('SELECT target, created_by AS createdBy FROM scan_tasks WHERE id = ?')
      .get(scanTaskId) as { target: string; createdBy: number | null } | undefined;
    if (!meta || meta.createdBy == null) return;
    if (outcome === 'failed') {
      notify(db, {
        userId: meta.createdBy,
        kind: 'scan_failed',
        scanTaskId,
        messageKey: 'notifications.msgScanFailed',
        params: { target: meta.target },
      });
      return;
    }
    notify(db, {
      userId: meta.createdBy,
      kind: 'scan_completed',
      scanTaskId,
      messageKey: 'notifications.msgScanCompleted',
      params: { target: meta.target },
    });
    const d = computeDiff(db, scanTaskId);
    if (d.added.length > 0) {
      notify(db, {
        userId: meta.createdBy,
        kind: 'new_issues',
        scanTaskId,
        messageKey: 'notifications.msgNewIssues',
        params: { target: meta.target, count: d.added.length },
      });
    }
  } catch {
    // 通知為盡力而為，不影響 job 結果
  }
}

export interface WorkerDeps {
  owner: string;
  leaseMs?: number;
  maxAttempts?: number;
  /** 注入：實際掃描→持久化→產報表→儲存（由 worker 程序入口接 scanner/mapping/report）。 */
  runJob: (scanTaskId: number) => Promise<void>;
}

export interface ProcessResult {
  processed: boolean;
  jobId?: number;
  ok?: boolean;
  error?: string;
}

/** 處理下一個 job：領取 → scan_task running → runJob → 完成/失敗 + 稽核（單頁/單任務失敗隔離）。 */
export async function processNextJob(db: Db, deps: WorkerDeps): Promise<ProcessResult> {
  const job = claimJob(db, deps.owner, deps.leaseMs ?? 60_000);
  if (!job) return { processed: false };
  setScanTaskStatus(db, job.scanTaskId, 'running');
  try {
    await deps.runJob(job.scanTaskId);
    completeJob(db, job.id);
    setScanTaskStatus(db, job.scanTaskId, 'completed');
    writeAudit(db, { action: 'scan.completed', resource: `scan_task:${job.scanTaskId}` });
    notifyScanOutcome(db, job.scanTaskId, 'completed');
    return { processed: true, jobId: job.id, ok: true };
  } catch (e) {
    const outcome = failJob(db, job.id, deps.maxAttempts ?? 3);
    if (outcome === 'failed') {
      setScanTaskStatus(db, job.scanTaskId, 'failed');
      notifyScanOutcome(db, job.scanTaskId, 'failed');
    }
    const error = e instanceof Error ? e.message : String(e);
    writeAudit(db, {
      action: `scan.${outcome}`,
      resource: `scan_task:${job.scanTaskId}`,
      detail: error,
    });
    return { processed: true, jobId: job.id, ok: false, error };
  }
}

/** 持續輪詢處理（單一 worker）。以 shouldStop 控制結束；無工作時 sleep。 */
export async function runWorker(
  db: Db,
  deps: WorkerDeps,
  opts: { pollMs?: number; schedulerTickMs?: number; shouldStop: () => boolean },
): Promise<void> {
  // 排程 tick 與 job 處理共用同一單一程序（ADR-010：不另開程序/不依 node-cron）。
  const schedulerTickMs = opts.schedulerTickMs ?? 60_000;
  let nextSchedulerAt = 0;
  while (!opts.shouldStop()) {
    if (schedulerTickMs > 0 && Date.now() >= nextSchedulerAt) {
      try {
        runSchedulerTick(db, new Date());
      } catch {
        // 隔離排程錯誤，不影響 job 處理迴圈
      }
      nextSchedulerAt = Date.now() + schedulerTickMs;
    }
    const result = await processNextJob(db, deps);
    if (!result.processed) {
      await new Promise((resolve) => setTimeout(resolve, opts.pollMs ?? 1000));
    }
  }
}
