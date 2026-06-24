import { describe, it, expect } from 'vitest';
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
});
