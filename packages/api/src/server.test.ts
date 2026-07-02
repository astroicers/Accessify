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

describe('自助改密（T801 / FR-101 / ADR-006）', () => {
  it('change-password：未登入 401；政策違規 400（過短/等於帳號/等於現密）；錯誤現密 401', async () => {
    const { db, app, adminPw } = await setup();
    const url = '/api/auth/change-password';
    expect(
      (await app.inject({ method: 'POST', url, payload: { currentPassword: 'x', newPassword: 'y'.repeat(12) } })).statusCode,
    ).toBe(401);
    const h = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const short = await app.inject({ method: 'POST', url, headers: h, payload: { currentPassword: adminPw, newPassword: 'short' } });
    expect(short.statusCode).toBe(400);
    expect(short.json().messageKey).toBe('error.passwordPolicy');
    // 新密碼等於帳號名（不分大小寫）→ 政策拒絕
    await createUser(db, { username: 'longname.user1', password: 'pw', role: 'viewer', cost: 6 });
    const uh = { authorization: `Bearer ${await login(app, 'longname.user1', 'pw')}` };
    const sameAsName = await app.inject({ method: 'POST', url, headers: uh, payload: { currentPassword: 'pw', newPassword: 'LONGNAME.USER1' } });
    expect(sameAsName.statusCode).toBe(400);
    expect(sameAsName.json().messageKey).toBe('error.passwordPolicy');
    const same = await app.inject({ method: 'POST', url, headers: h, payload: { currentPassword: adminPw, newPassword: adminPw } });
    expect(same.statusCode).toBe(400);
    expect(same.json().messageKey).toBe('error.passwordSame');
    const wrong = await app.inject({ method: 'POST', url, headers: h, payload: { currentPassword: 'totally-wrong-pw', newPassword: 'valid-new-pass-01' } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().messageKey).toBe('error.wrongPassword');
  });

  it('change-password 成功：舊密失效、新密可登入且 mustChange 清除、其他 session 失效、當前保留、寫入稽核', async () => {
    const { db, app } = await setup();
    await createUser(db, { username: 'cu', password: 'pw', role: 'viewer', mustChangePassword: true, cost: 6 });
    const t1 = await login(app, 'cu', 'pw');
    const t2 = await login(app, 'cu', 'pw');
    const h1 = { authorization: `Bearer ${t1}` };
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: h1,
      payload: { currentPassword: 'pw', newPassword: 'brand-new-pass-01' },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'cu', password: 'pw' } })).statusCode,
    ).toBe(401);
    const relogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'cu', password: 'brand-new-pass-01' } });
    expect(relogin.statusCode).toBe(200);
    expect(relogin.json().mustChangePassword).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/api/scans', headers: { authorization: `Bearer ${t2}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/scans', headers: h1 })).statusCode).toBe(200);
    const audit = db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'auth.change_password'").get() as { c: number };
    expect(audit.c).toBe(1);
  });
});

describe('帳號管理（T802 / FR-101/102/104 / ADR-006）', () => {
  it('users 清單：viewer 403；admin 200、含 locked 布林、絕不含 password_hash', async () => {
    const { db, app, adminPw } = await setup();
    await createUser(db, { username: 'v1', password: 'pw', role: 'viewer', cost: 6 });
    const vh = { authorization: `Bearer ${await login(app, 'v1', 'pw')}` };
    expect((await app.inject({ method: 'GET', url: '/api/users', headers: vh })).statusCode).toBe(403);
    const ah = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const r = await app.inject({ method: 'GET', url: '/api/users', headers: ah });
    expect(r.statusCode).toBe(200);
    const list = r.json() as Array<Record<string, unknown>>;
    expect(list.length).toBe(2);
    expect(r.body).not.toContain('password_hash');
    const v = list.find((u) => u.username === 'v1')!;
    expect(v.role).toBe('viewer');
    expect(v.locked).toBe(false);
  });

  it('users 建立：指定密碼可登入；未給密碼回一次性密碼且強制改密；弱密/非法名/重複/403 皆拒絕；寫入稽核', async () => {
    const { db, app, adminPw } = await setup();
    const ah = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const url = '/api/users';
    // 指定密碼（滿足政策）→ 201 並可登入、無強制改密
    const withPw = await app.inject({
      method: 'POST', url, headers: ah,
      payload: { username: 'op1', role: 'viewer', password: 'operator-pass-01' },
    });
    expect(withPw.statusCode).toBe(201);
    expect(withPw.json().generatedPassword).toBeUndefined();
    const l1 = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'op1', password: 'operator-pass-01' } });
    expect(l1.statusCode).toBe(200);
    expect(l1.json().mustChangePassword).toBe(false);
    // 未給密碼 → 回傳一次性密碼（僅此一次）、登入後 mustChangePassword=true
    const gen = await app.inject({ method: 'POST', url, headers: ah, payload: { username: 'op2', role: 'admin' } });
    expect(gen.statusCode).toBe(201);
    const otp = gen.json().generatedPassword as string;
    expect(otp.length).toBeGreaterThanOrEqual(12);
    const l2 = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'op2', password: otp } });
    expect(l2.statusCode).toBe(200);
    expect(l2.json().mustChangePassword).toBe(true);
    // 弱密碼 → 400 政策；非法 username → 400；重複 → 409
    expect((await app.inject({ method: 'POST', url, headers: ah, payload: { username: 'op3', role: 'viewer', password: 'short' } })).json().messageKey).toBe('error.passwordPolicy');
    expect((await app.inject({ method: 'POST', url, headers: ah, payload: { username: 'bad name!', role: 'viewer' } })).json().messageKey).toBe('error.invalidUsername');
    expect((await app.inject({ method: 'POST', url, headers: ah, payload: { username: 'op1', role: 'viewer' } })).statusCode).toBe(409);
    // viewer 403
    const vh = { authorization: `Bearer ${await login(app, 'op1', 'operator-pass-01')}` };
    expect((await app.inject({ method: 'POST', url, headers: vh, payload: { username: 'x9', role: 'viewer' } })).statusCode).toBe(403);
    // 稽核含 user.create、且 detail 不含一次性密碼
    const audits = db.prepare("SELECT detail FROM audit_logs WHERE action = 'user.create'").all() as Array<{ detail: string | null }>;
    expect(audits.length).toBe(2);
    for (const a of audits) expect(a.detail ?? '').not.toContain(otp);
  });

  it('users 更新：改 role 即時生效；停用即殺 session 且無法再登入；selfManage 400；不存在 404；寫入稽核', async () => {
    const { db, app, adminPw } = await setup();
    const ah = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const uid = await createUser(db, { username: 'v2', password: 'pw', role: 'viewer', cost: 6 });
    const vt = await login(app, 'v2', 'pw');
    const vhdr = { authorization: `Bearer ${vt}` };
    // viewer 無法進 /api/settings
    expect((await app.inject({ method: 'GET', url: '/api/settings', headers: vhdr })).statusCode).toBe(403);
    // 升 admin → 既有 session 即時取得權限（role 逐請求讀 users 表）
    expect(
      (await app.inject({ method: 'PUT', url: `/api/users/${uid}`, headers: ah, payload: { role: 'admin' } })).statusCode,
    ).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/settings', headers: vhdr })).statusCode).toBe(200);
    // 降回 viewer + 停用 → session 立即失效、再登入 401
    expect(
      (await app.inject({ method: 'PUT', url: `/api/users/${uid}`, headers: ah, payload: { role: 'viewer', status: 'disabled' } })).statusCode,
    ).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/scans', headers: vhdr })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'v2', password: 'pw' } })).statusCode,
    ).toBe(401);
    // 對自己操作 → 400 selfManage。
    // 「至少一位 active admin」不變量由此守衛 + requireRole(admin) 共同保證：
    // 唯一 active admin 經 API 只可能被自己變更，而自己已被 selfManage 擋（lastAdmin 409 為防禦縱深）。
    const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const self = await app.inject({ method: 'PUT', url: `/api/users/${adminId}`, headers: ah, payload: { role: 'viewer' } });
    expect(self.statusCode).toBe(400);
    expect(self.json().messageKey).toBe('error.selfManage');
    // 不存在 → 404
    expect(
      (await app.inject({ method: 'PUT', url: '/api/users/999', headers: ah, payload: { role: 'viewer' } })).statusCode,
    ).toBe(404);
    // 稽核：兩次成功更新
    const audit = db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'user.update'").get() as { c: number };
    expect(audit.c).toBe(2);
  });

  it('users 重設密碼：舊密失效、一次性密碼可登入且強制改密、session 清空、鎖定歸零（兼解鎖）；self 400；不存在 404；稽核', async () => {
    const { db, app, adminPw } = await setup();
    const ah = { authorization: `Bearer ${await login(app, 'admin', adminPw)}` };
    const uid = await createUser(db, { username: 'v4', password: 'pw', role: 'viewer', cost: 6 });
    const vt = await login(app, 'v4', 'pw');
    // 先把帳號打到鎖定（5 次錯密）
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'v4', password: 'nope' } });
    }
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'v4', password: 'pw' } })).statusCode,
    ).toBe(401);
    // admin 重設 → 回一次性密碼；session 清空；鎖定/計數歸零
    const r = await app.inject({ method: 'POST', url: `/api/users/${uid}/reset-password`, headers: ah });
    expect(r.statusCode).toBe(200);
    const otp = r.json().generatedPassword as string;
    expect(otp.length).toBeGreaterThanOrEqual(12);
    expect((await app.inject({ method: 'GET', url: '/api/scans', headers: { authorization: `Bearer ${vt}` } })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'v4', password: 'pw' } })).statusCode,
    ).toBe(401);
    const relogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'v4', password: otp } });
    expect(relogin.statusCode).toBe(200);
    expect(relogin.json().mustChangePassword).toBe(true);
    // self → 400；不存在 → 404
    const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    expect((await app.inject({ method: 'POST', url: `/api/users/${adminId}/reset-password`, headers: ah })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/users/999/reset-password', headers: ah })).statusCode).toBe(404);
    // 稽核含 user.reset_password 且不含一次性密碼
    const audits = db.prepare("SELECT detail FROM audit_logs WHERE action = 'user.reset_password'").all() as Array<{ detail: string | null }>;
    expect(audits.length).toBe(1);
    expect(audits[0]?.detail ?? '').not.toContain(otp);
  });

});

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
