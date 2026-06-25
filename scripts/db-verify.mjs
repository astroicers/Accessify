#!/usr/bin/env node
// 驗證 SQLite 備份/還原檔可用（T703）：PRAGMA quick_check + 回報 schema_version。
// 還原前必跑；非 'ok' 則以非零退出。用法：node scripts/db-verify.mjs <db>
import Database from 'better-sqlite3';

const [path] = process.argv.slice(2);
if (!path) {
  console.error('usage: db-verify.mjs <db>');
  process.exit(1);
}

const db = new Database(path, { readonly: true });
try {
  const qc = db.pragma('quick_check', { simple: true });
  if (qc !== 'ok') {
    console.error(`integrity FAIL: ${String(qc)}`);
    process.exit(1);
  }
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  console.log(`integrity ok; schema_version=${row?.v ?? 0}`);
} finally {
  db.close();
}
