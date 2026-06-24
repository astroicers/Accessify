// @accessify/core/migrate — 版本化遷移（ADR-003）
// expand-contract（向後相容）：先擴充、再收斂，配合 ADR-002 映像回滾。
// schema_version 記錄已套用版本；runMigrations 於單一交易內套用待辦遷移，冪等。

import type { Db } from './db.js';

export interface Migration {
  version: number;
  name: string;
  up: string;
}

const INIT_SQL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('url','sitemap')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 內嵌佇列：state + lease/heartbeat（跨程序並發續接，ADR-003）
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_task_id INTEGER NOT NULL REFERENCES scan_tasks(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','running','done','failed','retry')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_task_id INTEGER NOT NULL REFERENCES scan_tasks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  render_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (render_status IN ('pending','ok','failed'))
);

CREATE TABLE issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  rule_code TEXT NOT NULL,
  wcag_ref TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','hint')),
  selector TEXT,
  message TEXT
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_task_id INTEGER NOT NULL REFERENCES scan_tasks(id) ON DELETE CASCADE,
  lang TEXT NOT NULL CHECK (lang IN ('zh-TW','en-US')),
  format TEXT NOT NULL CHECK (format IN ('html','pdf','xlsx')),
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  resource TEXT,
  ip TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  detail TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX idx_jobs_state ON jobs (state, scan_task_id);
CREATE INDEX idx_pages_task ON pages (scan_task_id);
CREATE INDEX idx_issues_page ON issues (page_id);
CREATE INDEX idx_issues_wcag ON issues (wcag_ref);
CREATE INDEX idx_issues_severity ON issues (severity);
CREATE INDEX idx_audit_user_ts ON audit_logs (user_id, timestamp);
`;

export const MIGRATIONS: Migration[] = [{ version: 1, name: 'init', up: INIT_SQL }];

/**
 * 套用所有待辦遷移（單一交易、冪等）。回傳本次套用的遷移數。
 */
export function runMigrations(db: Db): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
    v: number | null;
  };
  const current = row.v ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  const insert = db.prepare(
    'INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)',
  );
  const apply = db.transaction((migrations: Migration[]) => {
    for (const m of migrations) {
      db.exec(m.up);
      insert.run(m.version, m.name, new Date().toISOString());
    }
  });
  apply(pending);
  return pending.length;
}
