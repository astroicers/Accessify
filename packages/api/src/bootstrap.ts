// @accessify/api/bootstrap — 首位 admin 離線 bootstrap（T506 / ADR-006）
// 無固定預設密碼：未提供則產生一次性隨機密碼並強制首登改密。

import type { Db } from '@accessify/core';
import { createUser, generateOneTimePassword } from './auth.js';

export interface EnsureAdminInput {
  username?: string;
  /** 未提供則隨機產生（一次性回傳，強制改密）。嚴禁固定預設值。 */
  password?: string;
  cost?: number;
}

export interface EnsureAdminResult {
  created: boolean;
  username?: string;
  /** 僅在系統自動產生密碼時回傳一次（供操作員首次登入）。 */
  generatedPassword?: string;
}

/** 若尚無任何 admin，建立首位 admin。系統處於未初始化前不應開放操作。 */
export async function ensureAdmin(db: Db, input: EnsureAdminInput = {}): Promise<EnsureAdminResult> {
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number }
  ).c;
  if (count > 0) return { created: false };

  const username = input.username ?? 'admin';
  const generated = input.password ? undefined : generateOneTimePassword();
  const password = input.password ?? generated!;
  await createUser(db, {
    username,
    password,
    role: 'admin',
    mustChangePassword: !input.password, // 自動產生密碼 → 強制改密
    cost: input.cost,
  });
  return { created: true, username, generatedPassword: generated };
}
