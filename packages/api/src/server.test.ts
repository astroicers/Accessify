import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, runMigrations, type Db } from '@accessify/core';
import { ensureAdmin } from './bootstrap.js';
import { createUser } from './auth.js';
import { buildServer } from './server.js';

async function setup(): Promise<{ db: Db; app: ReturnType<typeof buildServer>; adminPw: string }> {
  const db = openDb(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO settings (key, value) VALUES ('scan_whitelist', 'intra.mil')").run();
  const { generatedPassword } = await ensureAdmin(db, { cost: 6 });
  const app = buildServer({ db });
  await app.ready();
  return { db, app, adminPw: generatedPassword! };
}

async function login(app: ReturnType<typeof buildServer>, username: string, password: string): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  return r.json().token as string;
}

describe('REST API（T502 / FR-206）', () => {
  it('healthz + openapi 契約', async () => {
    const { app } = await setup();
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    const oas = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(oas.json().openapi).toBeTruthy();
  });

  it('未登入存取受保護路由 → 401；登入後可存取', async () => {
    const { app, adminPw } = await setup();
    expect((await app.inject({ method: 'GET', url: '/api/scans' })).statusCode).toBe(401);
    const token = await login(app, 'admin', adminPw);
    const r = await app.inject({ method: 'GET', url: '/api/scans', headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
  });

  it('建立掃描：白名單外 400、白名單內 201 並入列', async () => {
    const { db, app, adminPw } = await setup();
    const token = await login(app, 'admin', adminPw);
    const h = { authorization: `Bearer ${token}` };
    const bad = await app.inject({ method: 'POST', url: '/api/scans', headers: h, payload: { target: 'https://evil.com/', type: 'url' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/api/scans', headers: h, payload: { target: 'https://intra.mil/', type: 'url' } });
    expect(ok.statusCode).toBe(201);
    expect((db.prepare('SELECT COUNT(*) AS c FROM jobs').get() as { c: number }).c).toBe(1);
  });

  it('RBAC：viewer 不可建立掃描 / 存取設定（403）', async () => {
    const { db, app } = await setup();
    await createUser(db, { username: 'v', password: 'pw', role: 'viewer', cost: 6 });
    const token = await login(app, 'v', 'pw');
    const h = { authorization: `Bearer ${token}` };
    expect(
      (await app.inject({ method: 'POST', url: '/api/scans', headers: h, payload: { target: 'https://intra.mil/', type: 'url' } })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/settings', headers: h })).statusCode).toBe(403);
  });

  it('報表下載：有檔 200 + content-disposition；不存在 404（FR-404）', async () => {
    const { db, app, adminPw } = await setup();
    const token = await login(app, 'admin', adminPw);
    const h = { authorization: `Bearer ${token}` };
    const taskId = Number(
      db
        .prepare("INSERT INTO scan_tasks (target, type, status, created_by) VALUES ('https://intra.mil/','url','completed',1)")
        .run().lastInsertRowid,
    );
    const file = join(mkdtempSync(join(tmpdir(), 'accessify-rep-')), 'report-zh-TW.html');
    writeFileSync(file, '<!doctype html><title>r</title>');
    const repId = Number(
      db
        .prepare("INSERT INTO reports (scan_task_id, lang, format, path) VALUES (?, 'zh-TW','html',?)")
        .run(taskId, file).lastInsertRowid,
    );
    const ok = await app.inject({ method: 'GET', url: `/api/reports/${repId}/download`, headers: h });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-disposition']).toContain('attachment');
    expect(ok.headers['content-type']).toContain('text/html');
    expect((await app.inject({ method: 'GET', url: '/api/reports/9999/download', headers: h })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/reports/${repId}/download` })).statusCode).toBe(401);
  });

  it('狀態頁：未登入 401；viewer 可讀（200）且回傳派生指標（T507）', async () => {
    const { db, app } = await setup();
    expect((await app.inject({ method: 'GET', url: '/api/status' })).statusCode).toBe(401);
    await createUser(db, { username: 'v2', password: 'pw', role: 'viewer', cost: 6 });
    const token = await login(app, 'v2', 'pw');
    const r = await app.inject({ method: 'GET', url: '/api/status', headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(['healthy', 'degraded', 'down']).toContain(body.overall);
    expect(body.queue).toHaveProperty('queued');
    expect(body.db.integrity).toBe('ok');
    // 不得洩漏絕對路徑（disk 僅派生值）。
    expect(JSON.stringify(body)).not.toMatch(/\/home\//);
  });

  it('設定：白名單格式驗證（合法 200、含 scheme/loopback 400）+ 未知鍵 400（T505）', async () => {
    const { db, app, adminPw } = await setup();
    const h = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    // 合法：多主機正規化儲存
    const okR = await app.inject({ method: 'PUT', url: '/api/settings', headers: h, payload: { scan_whitelist: 'intra.mil, portal.intra.mil' } });
    expect(okR.statusCode).toBe(200);
    expect((db.prepare("SELECT value FROM settings WHERE key='scan_whitelist'").get() as { value: string }).value).toBe('intra.mil,portal.intra.mil');
    // 非法：scheme
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: h, payload: { scan_whitelist: 'https://intra.mil' } })).statusCode).toBe(400);
    // 非法：loopback
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: h, payload: { scan_whitelist: '127.0.0.1' } })).statusCode).toBe(400);
    // 非法：未知設定鍵（防注入）
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: h, payload: { evil_key: 'x' } })).statusCode).toBe(400);
  });

  it('排程：建立/間隔界線/白名單/唯一/RBAC/停用/刪除（T601）', async () => {
    const { db, app, adminPw } = await setup();
    const h = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    await createUser(db, { username: 'sv', password: 'pw', role: 'viewer', cost: 6 });
    const vh = { authorization: `Bearer ${await login(app, 'sv', 'pw')}` };
    // viewer 不能建立
    expect(
      (await app.inject({ method: 'POST', url: '/api/schedules', headers: vh, payload: { target: 'https://intra.mil/', type: 'url', interval_seconds: 3600 } })).statusCode,
    ).toBe(403);
    // 合法建立
    const ok = await app.inject({ method: 'POST', url: '/api/schedules', headers: h, payload: { target: 'https://intra.mil/', type: 'url', interval_seconds: 3600 } });
    expect(ok.statusCode).toBe(201);
    const id = ok.json().id as number;
    // 間隔過短 400
    expect((await app.inject({ method: 'POST', url: '/api/schedules', headers: h, payload: { target: 'https://intra.mil/a', type: 'url', interval_seconds: 5 } })).statusCode).toBe(400);
    // 非白名單 400
    expect((await app.inject({ method: 'POST', url: '/api/schedules', headers: h, payload: { target: 'https://evil.example/', type: 'url', interval_seconds: 3600 } })).statusCode).toBe(400);
    // 重複 target 409
    expect((await app.inject({ method: 'POST', url: '/api/schedules', headers: h, payload: { target: 'https://intra.mil/', type: 'url', interval_seconds: 7200 } })).statusCode).toBe(409);
    // 列表 / 停用 / 刪除
    expect((await app.inject({ method: 'GET', url: '/api/schedules', headers: h })).json().length).toBe(1);
    expect((await app.inject({ method: 'PUT', url: `/api/schedules/${id}`, headers: h, payload: { enabled: false } })).statusCode).toBe(200);
    expect((db.prepare('SELECT enabled FROM schedules WHERE id=?').get(id) as { enabled: number }).enabled).toBe(0);
    expect((await app.inject({ method: 'DELETE', url: `/api/schedules/${id}`, headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/schedules', headers: h })).json().length).toBe(0);
  });

  it('掃描差異端點：200 + baseline 分類；不存在 404（T602）', async () => {
    const { db, app, adminPw } = await setup();
    const h = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const id = Number(
      db.prepare("INSERT INTO scan_tasks (target, type, status, created_by) VALUES ('https://intra.mil/','url','completed',1)").run().lastInsertRowid,
    );
    const r = await app.inject({ method: 'GET', url: `/api/scans/${id}/diff`, headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.json().baselineScanId).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/scans/9999/diff', headers: h })).statusCode).toBe(404);
  });

  it('通知：本人範圍 + 未讀計數 + 標記已讀（T603）', async () => {
    const { db, app, adminPw } = await setup();
    const h = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const adminId = (db.prepare("SELECT id FROM users WHERE username='admin'").get() as { id: number }).id;
    await createUser(db, { username: 'nv', password: 'pw', role: 'viewer', cost: 6 });
    const vid = (db.prepare("SELECT id FROM users WHERE username='nv'").get() as { id: number }).id;
    const vh = { authorization: `Bearer ${await login(app, 'nv', 'pw')}` };
    db.prepare("INSERT INTO notifications (user_id, kind, message_key) VALUES (?, 'scan_completed', 'notifications.msgScanCompleted')").run(adminId);
    const nid = Number(
      db.prepare("INSERT INTO notifications (user_id, kind, message_key) VALUES (?, 'new_issues', 'notifications.msgNewIssues')").run(adminId).lastInsertRowid,
    );
    db.prepare("INSERT INTO notifications (user_id, kind, message_key) VALUES (?, 'scan_completed', 'notifications.msgScanCompleted')").run(vid);

    expect((await app.inject({ method: 'GET', url: '/api/notifications', headers: h })).json().length).toBe(2);
    expect((await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers: h })).json().count).toBe(2);
    // viewer 只看到自己的；且不能標記他人通知（404）
    expect((await app.inject({ method: 'GET', url: '/api/notifications', headers: vh })).json().length).toBe(1);
    expect((await app.inject({ method: 'POST', url: `/api/notifications/${nid}/read`, headers: vh })).statusCode).toBe(404);
    // 本人標記 → 未讀減少；read-all 清零
    expect((await app.inject({ method: 'POST', url: `/api/notifications/${nid}/read`, headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers: h })).json().count).toBe(1);
    await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: h });
    expect((await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers: h })).json().count).toBe(0);
  });
});
