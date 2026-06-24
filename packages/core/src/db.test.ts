import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { runMigrations, MIGRATIONS } from './migrate.js';

const EXPECTED_TABLES = [
  'users',
  'scan_tasks',
  'jobs',
  'pages',
  'issues',
  'reports',
  'audit_logs',
  'settings',
  'schema_version',
];

describe('@accessify/core db + migrations（ADR-003）', () => {
  it('openDb（檔案）啟用 WAL / foreign_keys / busy_timeout', () => {
    const dir = mkdtempSync(join(tmpdir(), 'accessify-'));
    try {
      const db = openDb(join(dir, 't.sqlite'));
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runMigrations 建立所有資料表，且冪等（再跑套用 0 筆）', () => {
    const db = openDb(':memory:');
    const applied = runMigrations(db);
    expect(applied).toBe(MIGRATIONS.length);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of EXPECTED_TABLES) expect(tables).toContain(t);
    expect(runMigrations(db)).toBe(0);
    db.close();
  });

  it('jobs 表含內嵌佇列狀態與 lease/heartbeat 欄位（ADR-003 跨程序並發）', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const cols = db
      .prepare('PRAGMA table_info(jobs)')
      .all()
      .map((r) => (r as { name: string }).name);
    for (const c of ['state', 'attempts', 'lease_owner', 'lease_expires_at', 'heartbeat_at']) {
      expect(cols).toContain(c);
    }
    db.close();
  });

  it('外鍵約束生效（issues.page_id 指向不存在的 page 應失敗）', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    expect(() =>
      db
        .prepare(
          "INSERT INTO issues (page_id, engine, rule_code, severity) VALUES (999, 'axe', 'x', 'high')",
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
