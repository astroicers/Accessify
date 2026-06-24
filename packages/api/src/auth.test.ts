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
