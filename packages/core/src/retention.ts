// @accessify/core/retention — 資料保留與磁碟治理（T705 / ADR-011）
// 刪除逾保留期且已結束的掃描（連同 pages/issues/reports/notifications 經 FK CASCADE）+ 對應報表檔，
// 並執行 WAL checkpoint(TRUNCATE) 以收斂 -wal 檔。純函式、注入時鐘，可單元測試。
// 安全：只刪 completed/failed（不動 running/queued）；julianday 數值比較避免 ISO-T 與 datetime 格式陷阱。

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.js';

export interface RetentionOptions {
  /** 保留天數；<=0 視為停用（不刪，只 checkpoint）。 */
  retentionDays: number;
  /** 報表檔根目錄（saveReport 的 baseDir）；逾期掃描的 `<id>/` 子目錄會被刪除。 */
  reportsBaseDir: string;
  now?: Date;
}

export interface RetentionResult {
  deletedScans: number;
}

function checkpoint(db: Db): void {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // checkpoint 失敗（如 :memory: 非 WAL）不影響保留結果
  }
}

export function runRetention(db: Db, opts: RetentionOptions): RetentionResult {
  const result: RetentionResult = { deletedScans: 0 };

  if (opts.retentionDays > 0) {
    const now = opts.now ?? new Date();
    const cutoffIso = new Date(now.getTime() - opts.retentionDays * 86_400_000).toISOString();
    const old = db
      .prepare(
        "SELECT id FROM scan_tasks WHERE status IN ('completed','failed') AND julianday(created_at) < julianday(?)",
      )
      .all(cutoffIso) as { id: number }[];

    if (old.length > 0) {
      const del = db.prepare('DELETE FROM scan_tasks WHERE id = ?');
      // 單一交易刪除（pages/issues/reports/notifications 經 FK ON DELETE CASCADE 一併清除）。
      db.transaction((ids: number[]) => {
        for (const id of ids) del.run(id);
      })(old.map((r) => r.id));

      // 報表檔需手動清（DB 列已隨 cascade 刪除；磁碟檔不在 cascade 範圍）。
      for (const { id } of old) {
        try {
          rmSync(join(opts.reportsBaseDir, String(id)), { recursive: true, force: true });
        } catch {
          // 單一檔案清除失敗不影響整體
        }
      }
      result.deletedScans = old.length;
    }
  }

  checkpoint(db); // 即使停用保留，仍定期收斂 WAL（ADR-011）
  return result;
}
