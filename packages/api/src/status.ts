// @accessify/api/status — 系統狀態彙整（T507 / FR / ADR-011）
// 僅輸出「派生值」（計數、百分比、ok/fail、秒數），絕不洩漏絕對路徑、主機清單、密鑰（ADR-008/009/011）。
// 純函式 collectStatus 與 HTTP 解耦，便於以記憶體 DB 測試；無任何對外網路（地端離線鐵則）。

import { statfsSync, readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import type { Db } from '@accessify/core';

export interface StatusThresholds {
  /** worker 心跳逾此秒數視為停滯。 */
  heartbeatStaleSec: number;
  /** 磁碟使用率達此百分比視為吃緊。 */
  diskUsedPct: number;
  /** TLS 憑證剩餘天數低於此值視為吃緊（ADR-011 站內告警）。 */
  certExpiryDays: number;
}

export const DEFAULT_THRESHOLDS: StatusThresholds = {
  heartbeatStaleSec: 120,
  diskUsedPct: 90,
  certExpiryDays: 14,
};

export interface ServerStatus {
  overall: 'healthy' | 'degraded' | 'down';
  uptimeSec: number;
  queue: {
    queued: number;
    running: number;
    failed: number;
    completed: number;
    oldestQueuedAgeSec: number | null;
  };
  worker: { heartbeatStaleSec: number | null; staleLeases: number };
  db: { integrity: 'ok' | 'fail'; schemaVersion: number };
  disk: { usedPct: number; freeBytes: number; totalBytes: number } | null;
  /** TLS 憑證剩餘天數（僅派生值，不回傳憑證內容/路徑）；無 TLS 或讀取失敗為 null。 */
  tls: { daysRemaining: number } | null;
  versions: { node: string; app: string; schema: number };
}

export interface CollectStatusOptions {
  /** 計算磁碟用量的目錄（僅用於 statfs，不回傳路徑本身）。預設 process.cwd()。 */
  dataDir?: string;
  appVersion?: string;
  /** TLS 憑證路徑（僅讀 notAfter 計算剩餘天數；不回傳路徑/內容）。 */
  tlsCertPath?: string;
  /** 測試可注入；預設 process.uptime()。 */
  uptimeSec?: number;
  /** 測試可注入「現在」（ISO 字串）；預設 new Date().toISOString()。 */
  now?: string;
  thresholds?: Partial<StatusThresholds>;
}

export function collectStatus(db: Db, opts: CollectStatusOptions = {}): ServerStatus {
  const th = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
  const now = opts.now ?? new Date().toISOString();

  // 佇列狀態計數（idx_jobs_state 覆蓋）。
  const stateRows = db.prepare('SELECT state, COUNT(*) AS n FROM jobs GROUP BY state').all() as {
    state: string;
    n: number;
  }[];
  const byState: Record<string, number> = {};
  for (const r of stateRows) byState[r.state] = r.n;

  const oldest = db
    .prepare(
      'SELECT (julianday(?) - julianday(created_at)) * 86400.0 AS age FROM jobs WHERE state = \'pending\' ORDER BY id ASC LIMIT 1',
    )
    .get(now) as { age: number } | undefined;

  const queue = {
    queued: byState.pending ?? 0,
    running: byState.running ?? 0,
    failed: byState.failed ?? 0,
    completed: byState.done ?? 0,
    oldestQueuedAgeSec: oldest ? Math.max(0, Math.round(oldest.age)) : null,
  };

  // worker 心跳：最近一次 running 心跳距今秒數；無 running job 則為 null。
  const hb = db
    .prepare(
      'SELECT (julianday(?) - julianday(MAX(heartbeat_at))) * 86400.0 AS stale FROM jobs WHERE state = \'running\' AND heartbeat_at IS NOT NULL',
    )
    .get(now) as { stale: number | null } | undefined;
  const heartbeatStaleSec = hb && hb.stale != null ? Math.max(0, Math.round(hb.stale)) : null;

  // 過期租約：running 但 lease_expires_at 已過（worker 崩潰留下的孤兒）。
  const staleRow = db
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE state = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?",
    )
    .get(now) as { n: number };
  const staleLeases = staleRow.n;

  // DB 完整性（quick_check 較 integrity_check 輕量）。
  let integrity: 'ok' | 'fail' = 'ok';
  try {
    const r = db.pragma('quick_check', { simple: true });
    integrity = r === 'ok' ? 'ok' : 'fail';
  } catch {
    integrity = 'fail';
  }
  const schemaRow = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
    v: number | null;
  };
  const schemaVersion = schemaRow.v ?? 0;

  // 磁碟用量（僅回傳派生值；失敗回 null，不拋出、不洩漏路徑）。
  let disk: ServerStatus['disk'] = null;
  try {
    const s = statfsSync(opts.dataDir ?? process.cwd());
    const blocks = Number(s.blocks);
    const bavail = Number(s.bavail);
    const bsize = Number(s.bsize);
    if (blocks > 0) {
      disk = {
        usedPct: Math.round((1 - bavail / blocks) * 100),
        freeBytes: bavail * bsize,
        totalBytes: blocks * bsize,
      };
    }
  } catch {
    disk = null;
  }

  const uptimeSec = Math.round(opts.uptimeSec ?? process.uptime());

  // TLS 憑證剩餘天數（僅讀 notAfter；失敗/無 TLS → null，不洩漏路徑/內容）。
  let tls: ServerStatus['tls'] = null;
  if (opts.tlsCertPath) {
    try {
      const cert = new X509Certificate(readFileSync(opts.tlsCertPath));
      const daysRemaining = Math.floor(
        (new Date(cert.validTo).getTime() - new Date(now).getTime()) / 86_400_000,
      );
      tls = { daysRemaining };
    } catch {
      tls = null;
    }
  }

  let overall: ServerStatus['overall'] = 'healthy';
  if (integrity === 'fail') {
    overall = 'down';
  } else if (
    staleLeases > 0 ||
    queue.failed > 0 ||
    (heartbeatStaleSec != null && heartbeatStaleSec > th.heartbeatStaleSec) ||
    (disk != null && disk.usedPct >= th.diskUsedPct) ||
    (tls != null && tls.daysRemaining < th.certExpiryDays)
  ) {
    overall = 'degraded';
  }

  return {
    overall,
    uptimeSec,
    queue,
    worker: { heartbeatStaleSec, staleLeases },
    db: { integrity, schemaVersion },
    disk,
    tls,
    versions: { node: process.version, app: opts.appVersion ?? '1.0.0', schema: schemaVersion },
  };
}
