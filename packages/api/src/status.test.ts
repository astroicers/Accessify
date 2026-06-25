import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, runMigrations, type Db } from '@accessify/core';
import { collectStatus } from './status.js';

function seed(): Db {
  const db = openDb(':memory:');
  runMigrations(db);
  // 建立一名使用者（id 1）滿足 scan_tasks.created_by 外鍵。
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('u', 'x', 'admin')").run();
  return db;
}
function addTask(db: Db): number {
  return Number(
    db
      .prepare("INSERT INTO scan_tasks (target, type, status, created_by) VALUES ('https://intra.mil/','url','queued',1)")
      .run().lastInsertRowid,
  );
}

describe('collectStatus（T507 / 系統狀態）', () => {
  it('空系統 → healthy；佇列全 0；integrity ok；schemaVersion>0；含 node/app 版本', () => {
    const db = seed();
    const s = collectStatus(db, { now: '2026-06-24T00:00:00.000Z', uptimeSec: 10, appVersion: '0.1.0' });
    expect(s.overall).toBe('healthy');
    expect(s.queue).toMatchObject({ queued: 0, running: 0, failed: 0, completed: 0, oldestQueuedAgeSec: null });
    expect(s.worker).toMatchObject({ heartbeatStaleSec: null, staleLeases: 0 });
    expect(s.db.integrity).toBe('ok');
    expect(s.db.schemaVersion).toBeGreaterThan(0);
    expect(s.versions.node).toMatch(/^v/);
    expect(s.versions.app).toBe('0.1.0');
    expect(s.uptimeSec).toBe(10);
  });

  it('佇列依 job state 彙整；有 failed job → degraded', () => {
    const db = seed();
    const t = addTask(db);
    db.prepare("INSERT INTO jobs (scan_task_id, state) VALUES (?, 'pending')").run(t);
    db.prepare("INSERT INTO jobs (scan_task_id, state) VALUES (?, 'done')").run(t);
    db.prepare("INSERT INTO jobs (scan_task_id, state) VALUES (?, 'failed')").run(t);
    const s = collectStatus(db, { now: '2026-06-24T00:00:00.000Z' });
    expect(s.queue.queued).toBe(1);
    expect(s.queue.completed).toBe(1);
    expect(s.queue.failed).toBe(1);
    expect(s.queue.oldestQueuedAgeSec).not.toBeNull();
    expect(s.overall).toBe('degraded');
  });

  it('過期租約（worker 崩潰孤兒）→ staleLeases>0 且 degraded', () => {
    const db = seed();
    const t = addTask(db);
    db.prepare(
      "INSERT INTO jobs (scan_task_id, state, lease_expires_at, heartbeat_at) VALUES (?, 'running', '2026-06-23T00:00:00.000Z', '2026-06-23T00:00:00.000Z')",
    ).run(t);
    const s = collectStatus(db, { now: '2026-06-24T00:00:00.000Z' });
    expect(s.worker.staleLeases).toBe(1);
    expect(s.overall).toBe('degraded');
  });
});

describe('collectStatus TLS 憑證到期（T706）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'accessify-tls-'));
  const cert = join(dir, 'cert.pem');
  const key = join(dir, 'key.pem');
  // 離線以 openssl 產生 365 天自簽憑證（CI/開發機皆具備）。
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-keyout', key, '-out', cert, '-subj', '/CN=test'],
    { stdio: 'ignore' },
  );
  const day = 86_400_000;

  it('有效憑證 → 正剩餘天數；近到期(<14d) → degraded；過期 → 負值', () => {
    const db = seed();
    const valid = collectStatus(db, { tlsCertPath: cert });
    expect(valid.tls).not.toBeNull();
    expect(valid.tls!.daysRemaining).toBeGreaterThan(300);

    const near = collectStatus(db, { tlsCertPath: cert, now: new Date(Date.now() + 358 * day).toISOString() });
    expect(near.tls!.daysRemaining).toBeLessThan(14);
    expect(near.overall).toBe('degraded');

    const expired = collectStatus(db, { tlsCertPath: cert, now: new Date(Date.now() + 400 * day).toISOString() });
    expect(expired.tls!.daysRemaining).toBeLessThan(0);
  });

  it('憑證缺檔/無法解析 → tls null 且不拋出', () => {
    const db = seed();
    expect(collectStatus(db, { tlsCertPath: '/nonexistent/cert.pem' }).tls).toBeNull();
  });
});
