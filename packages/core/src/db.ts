// @accessify/core/db — SQLite 連線（ADR-003）
// WAL 多讀單寫；api 與 worker 為兩個寫入程序，故每連線設 busy_timeout + 短交易。

import Database from 'better-sqlite3';

export type Db = Database.Database;

export interface OpenDbOptions {
  /** busy_timeout（毫秒）：瞬間寫入鎖以重試等待化解，避免直接 SQLITE_BUSY。 */
  busyTimeoutMs?: number;
  readonly?: boolean;
}

/**
 * 開啟 SQLite 連線並套用標準 PRAGMA（ADR-003）。
 * @param path 檔案路徑；':memory:' 為記憶體（測試用，WAL 不適用）。
 */
export function openDb(path = ':memory:', options: OpenDbOptions = {}): Db {
  const db = new Database(path, { readonly: options.readonly ?? false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
  return db;
}
