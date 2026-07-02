import { describe, it, expect } from 'vitest';
import { openDb, runMigrations, type Db } from '@accessify/core';
import {
  createUser,
  authenticate,
  createSession,
  validateSession,
  destroySession,
  hasRole,
  hashPassword,
  verifyPassword,
  changePassword,
  generateOneTimePassword,
  destroyOtherSessions,
  destroyUserSessions,
} from './auth.js';

function freshDb(): Db {
  const db = openDb(':memory:');
  runMigrations(db);
  return db;
}

describe('auth：帳號 / 鎖定 / session / RBAC（T503）', () => {
  it('hashPassword / verifyPassword roundtrip', async () => {
    const h = await hashPassword('s3cret', 6);
    expect(await verifyPassword('s3cret', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('createUser + authenticate 成功', async () => {
    const db = freshDb();
    await createUser(db, { username: 'admin', password: 'pw', role: 'admin', cost: 6 });
    const r = await authenticate(db, 'admin', 'pw');
    expect(r.ok).toBe(true);
    expect(r.role).toBe('admin');
  });

  it('錯密碼累計失敗，達上限鎖定（即使之後密碼正確）', async () => {
    const db = freshDb();
    await createUser(db, { username: 'u', password: 'pw', role: 'viewer', cost: 6 });
    expect((await authenticate(db, 'u', 'x', { maxFailures: 3 })).reason).toBe('invalid');
    expect((await authenticate(db, 'u', 'x', { maxFailures: 3 })).reason).toBe('invalid');
    expect((await authenticate(db, 'u', 'x', { maxFailures: 3 })).reason).toBe('locked');
    expect((await authenticate(db, 'u', 'pw', { maxFailures: 3 })).reason).toBe('locked');
  });

  it('session create / validate / destroy', () => {
    const db = freshDb();
    const uid = Number(
      db.prepare("INSERT INTO users (username,password_hash,role,status) VALUES ('a','x','admin','active')").run()
        .lastInsertRowid,
    );
    const token = createSession(db, uid, 60_000);
    expect(validateSession(db, token)?.role).toBe('admin');
    destroySession(db, token);
    expect(validateSession(db, token)).toBeNull();
  });

  it('過期 session 無效', () => {
    const db = freshDb();
    const uid = Number(
      db.prepare("INSERT INTO users (username,password_hash,role,status) VALUES ('a','x','viewer','active')").run()
        .lastInsertRowid,
    );
    expect(validateSession(db, createSession(db, uid, -1000))).toBeNull();
  });

  it('RBAC：admin 可 view、viewer 不可 admin', () => {
    expect(hasRole('admin', 'viewer')).toBe(true);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('viewer', 'viewer')).toBe(true);
    expect(hasRole('viewer', 'admin')).toBe(false);
  });
});

describe('自助改密與帳號治理（T801 / ADR-006 / FR-101）', () => {
  it('changePassword 成功：舊密碼失效、新密碼可登入、must_change_password 清除', async () => {
    const db = freshDb();
    const uid = await createUser(db, {
      username: 'u1',
      password: 'old-password-123',
      role: 'viewer',
      mustChangePassword: true,
      cost: 6,
    });
    const r = await changePassword(db, uid, 'old-password-123', 'new-password-456', { cost: 6 });
    expect(r.ok).toBe(true);
    expect((await authenticate(db, 'u1', 'old-password-123')).ok).toBe(false);
    const after = await authenticate(db, 'u1', 'new-password-456');
    expect(after.ok).toBe(true);
    expect(after.mustChangePassword).toBe(false);
  });

  it('changePassword 錯誤目前密碼：累計鎖定計數，鎖定中即使現密正確亦拒絕', async () => {
    const db = freshDb();
    const uid = await createUser(db, { username: 'u2', password: 'correct-password-1', role: 'viewer', cost: 6 });
    const opts = { cost: 6, maxFailures: 3 };
    expect((await changePassword(db, uid, 'wrong-pw', 'new-password-456', opts)).reason).toBe('invalid');
    expect((await changePassword(db, uid, 'wrong-pw', 'new-password-456', opts)).reason).toBe('invalid');
    expect((await changePassword(db, uid, 'wrong-pw', 'new-password-456', opts)).reason).toBe('locked');
    // 已鎖定：現密正確亦拒絕，且密碼未被變更
    expect((await changePassword(db, uid, 'correct-password-1', 'new-password-456', opts)).reason).toBe('locked');
  });

  it('generateOneTimePassword：長度 ≥ 12、base64url 字元集、每次不同', () => {
    const pw = generateOneTimePassword();
    expect(pw.length).toBeGreaterThanOrEqual(12);
    expect(/^[A-Za-z0-9_-]+$/.test(pw)).toBe(true);
    expect(generateOneTimePassword()).not.toBe(pw);
  });

  it('destroyOtherSessions 保留指定 token、其餘刪除；destroyUserSessions 全刪', async () => {
    const db = freshDb();
    const uid = await createUser(db, { username: 'u3', password: 'pw', role: 'viewer', cost: 6 });
    const keep = createSession(db, uid, 60_000);
    const other = createSession(db, uid, 60_000);
    destroyOtherSessions(db, uid, keep);
    expect(validateSession(db, keep)).not.toBeNull();
    expect(validateSession(db, other)).toBeNull();
    destroyUserSessions(db, uid);
    expect(validateSession(db, keep)).toBeNull();
  });

  it('validateSession：使用者停用後既有 session 立即失效', async () => {
    const db = freshDb();
    const uid = await createUser(db, { username: 'u4', password: 'pw', role: 'viewer', cost: 6 });
    const token = createSession(db, uid, 60_000);
    expect(validateSession(db, token)).not.toBeNull();
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(uid);
    expect(validateSession(db, token)).toBeNull();
  });
});
