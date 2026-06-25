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

// 0002：認證強化（登入鎖定、強制改密）+ server-side session（ADR-006）。expand-contract，僅新增。
const AUTH_SQL = `
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_token ON sessions (token_hash);
`;

// 0003：排程重掃（T601 / ADR-010）。相對間隔（秒），時間皆存 ISO-8601 UTC TEXT。expand-contract，僅新增。
const SCHEDULES_SQL = `
CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('url','sitemap')),
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds > 0),
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_schedules_target ON schedules (target);
CREATE INDEX idx_schedules_due ON schedules (enabled, next_run_at);
`;

// 0004：站內通知（T603 / FR-503）。訊息存 i18n key + params（顯示時依使用者語系渲染，不存在地化字串）。
// SMTP（外送）刻意未實作：屬新執行期相依 + 新出站路徑，依鐵則須先有 ADR（待 ADR-012）。
const NOTIFICATIONS_SQL = `
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  scan_task_id INTEGER REFERENCES scan_tasks(id) ON DELETE CASCADE,
  message_key TEXT NOT NULL,
  params_json TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications (user_id, read, id);
`;

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'init', up: INIT_SQL },
  { version: 2, name: 'auth_sessions', up: AUTH_SQL },
  { version: 3, name: 'schedules', up: SCHEDULES_SQL },
  { version: 4, name: 'notifications', up: NOTIFICATIONS_SQL },
];

/**
 * 套用所有待辦遷移。回傳本次套用的遷移數。
 * 併發安全：以 EXCLUSIVE 交易序列化（api 與 worker 兩寫入程序可同時啟動；busy_timeout 等鎖後重讀版本而非重套）。
 * Fail-closed：若 DB schema_version 高於本執行檔已知最高版本（如回滾到舊映像卻面對新 schema），直接拋錯拒絕啟動，
 *   避免舊程式對不認識的 schema 靜默運作（ADR-002 回滾安全）。
 */
export function runMigrations(db: Db): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const maxKnown = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 0);
  const insert = db.prepare(
    'INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)',
  );
  let applied = 0;
  const run = db.transaction(() => {
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {
      v: number | null;
    };
    const current = row.v ?? 0;
    if (current > maxKnown) {
      throw new Error(
        `schema_version ${current} 高於本執行檔支援的最高版本 ${maxKnown}；拒絕啟動（請改用相容映像，或還原相容備份再回滾）。`,
      );
    }
    const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
    for (const m of pending) {
      db.exec(m.up);
      insert.run(m.version, m.name, new Date().toISOString());
    }
    applied = pending.length;
  });
  // EXCLUSIVE：兩程序併發啟動時，後者等鎖→於鎖內重讀版本→無待辦則 no-op（不重複套用、不衝突）。
  run.exclusive();
  return applied;
}
