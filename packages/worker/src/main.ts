// @accessify/worker/main — 背景 worker 程序入口（T701）。
// 開 DB → 套遷移 → 以真實 runJob 跑 core.runWorker（含排程 tick）。零對外（掃描受 egress 白名單把關）。

import os from 'node:os';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb, runMigrations, runWorker, runRetention } from '@accessify/core';
import { makeRunJob } from './run-job.js';

function numEnv(name: string, def: number): number {
  const v = process.env[name];
  const n = v == null ? def : Number(v);
  return Number.isFinite(n) ? n : def;
}

async function main(): Promise<void> {
  const dbPath = process.env.ACCESSIFY_DB_PATH;
  const reportsBaseDir = process.env.ACCESSIFY_REPORTS_DIR;
  if (!dbPath || !reportsBaseDir) {
    console.error('[worker] ACCESSIFY_DB_PATH and ACCESSIFY_REPORTS_DIR are required');
    process.exit(1);
    return;
  }

  const db = openDb(dbPath, { busyTimeoutMs: numEnv('BUSY_TIMEOUT_MS', 5000) });
  runMigrations(db);

  const runJob = makeRunJob(db, {
    reportsBaseDir,
    navigationTimeoutMs: numEnv('NAV_TIMEOUT_MS', 15000),
    maxPages: numEnv('MAX_PAGES', 200),
    chromiumSandbox: process.env.CHROMIUM_SANDBOX !== 'false',
  });

  // Liveness 心跳檔：證明程序與 event loop 仍存活（容器 healthcheck 讀取其新鮮度）。
  // 掃描為 async，event loop 期間仍可回應，故 timer 能如期寫入；真正卡死/崩潰則停止更新。
  const heartbeatPath = join(dirname(dbPath), 'worker.heartbeat');
  const writeHeartbeat = (): void => {
    try {
      writeFileSync(heartbeatPath, String(Date.now()));
    } catch {
      // 心跳寫入失敗不影響處理
    }
  };
  writeHeartbeat();
  const heartbeat = setInterval(writeHeartbeat, 30_000);

  // 資料保留與磁碟治理（T705 / ADR-011）：定期刪逾期掃描+報表檔，並 WAL checkpoint 收斂 -wal。
  // RETENTION_DAYS<=0 表停用刪除（仍會 checkpoint）。預設每日。
  const retentionDays = numEnv('RETENTION_DAYS', 0);
  const retentionTickMs = numEnv('RETENTION_TICK_MS', 86_400_000);
  const runRet = (): void => {
    try {
      const r = runRetention(db, { retentionDays, reportsBaseDir });
      if (r.deletedScans > 0) console.log(`[worker] retention: removed ${r.deletedScans} expired scan(s)`);
    } catch (e) {
      console.error('[worker] retention error', e);
    }
  };
  runRet();
  const retention = setInterval(runRet, retentionTickMs);

  let stop = false;
  const shutdown = (): void => {
    stop = true;
    clearInterval(heartbeat);
    clearInterval(retention);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('[worker] started');
  await runWorker(
    db,
    {
      owner: process.env.WORKER_OWNER ?? `${os.hostname()}-${process.pid}`,
      leaseMs: numEnv('LEASE_MS', 60000),
      maxAttempts: numEnv('MAX_ATTEMPTS', 3),
      runJob,
    },
    {
      pollMs: numEnv('WORKER_POLL_MS', 1000),
      schedulerTickMs: numEnv('SCHEDULER_TICK_MS', 60000),
      shouldStop: () => stop,
    },
  );
  console.log('[worker] stopped');
  process.exit(0);
}

void main().catch((e: unknown) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
