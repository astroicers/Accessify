// @accessify/api/auth — 本地帳號 + RBAC + 登入鎖定 + server-side session（T503 / ADR-006 / FR-101~104）

import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import type { Db } from '@accessify/core';

export type Role = 'admin' | 'viewer';

const DEFAULT_COST = 12;
const nowIso = (): string => new Date().toISOString();
const offsetIso = (ms: number): string => new Date(Date.now() + ms).toISOString();

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  status: string;
  failed_attempts: number;
  locked_until: string | null;
  must_change_password: number;
}

export async function hashPassword(password: string, cost = DEFAULT_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
  mustChangePassword?: boolean;
  cost?: number;
}

export async function createUser(db: Db, input: CreateUserInput): Promise<number> {
  const hash = await hashPassword(input.password, input.cost);
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, role, status, must_change_password) VALUES (?, ?, ?, 'active', ?)",
    )
    .run(input.username, hash, input.role, input.mustChangePassword ? 1 : 0);
  return Number(info.lastInsertRowid);
}

export function getUserByUsername(db: Db, username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export interface AuthOptions {
  maxFailures?: number;
  lockMs?: number;
}
export interface AuthResult {
  ok: boolean;
  userId?: number;
  role?: Role;
  mustChangePassword?: boolean;
  reason?: 'invalid' | 'locked' | 'disabled';
}

/** 驗證帳密；失敗累計達上限即鎖定一段時間（ADR-006）。 */
export async function authenticate(
  db: Db,
  username: string,
  password: string,
  opts: AuthOptions = {},
): Promise<AuthResult> {
  const user = getUserByUsername(db, username);
  if (!user) return { ok: false, reason: 'invalid' };
  if (user.status !== 'active') return { ok: false, reason: 'disabled' };
  if (user.locked_until && user.locked_until > nowIso()) return { ok: false, reason: 'locked' };

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const failed = user.failed_attempts + 1;
    const lockedUntil = failed >= (opts.maxFailures ?? 5) ? offsetIso(opts.lockMs ?? 15 * 60_000) : null;
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(
      failed,
      lockedUntil,
      user.id,
    );
    return { ok: false, reason: lockedUntil ? 'locked' : 'invalid' };
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  return {
    ok: true,
    userId: user.id,
    role: user.role,
    mustChangePassword: user.must_change_password === 1,
  };
}

// ── server-side session（token 雜湊後儲存）──

export function createSession(db: Db, userId: number, ttlMs = 30 * 60_000): string {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    tokenHash,
    offsetIso(ttlMs),
  );
  return token;
}

export function validateSession(db: Db, token: string): { userId: number; role: Role } | null {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const row = db
    .prepare(
      `SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.role AS role
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as { userId: number; expiresAt: string; role: Role } | undefined;
  if (!row || row.expiresAt <= nowIso()) return null;
  return { userId: row.userId, role: row.role };
}

export function destroySession(db: Db, token: string): void {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/** RBAC：admin 可做 viewer 能做的事；viewer 不能做 admin 的事。 */
export function hasRole(role: Role, required: Role): boolean {
  if (required === 'viewer') return role === 'viewer' || role === 'admin';
  return role === 'admin';
}
