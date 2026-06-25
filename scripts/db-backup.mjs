#!/usr/bin/env node
// SQLite WAL 一致性備份（T703 / ADR-003/011）。
// 使用 better-sqlite3 Online Backup API：對「使用中」資料庫取一致快照（含未 checkpoint 的 WAL），
// 絕不可對使用中主檔直接 cp。用法：node scripts/db-backup.mjs <src.db> <dest.db>
import Database from 'better-sqlite3';

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error('usage: db-backup.mjs <src.db> <dest.db>');
  process.exit(1);
}

const db = new Database(src, { readonly: true });
try {
  await db.backup(dest); // Online Backup API：一致快照，產出獨立單檔（不含 -wal/-shm）。
} finally {
  db.close();
}
console.log(`backup ok: ${dest}`);
