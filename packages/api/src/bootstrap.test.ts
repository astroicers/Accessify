import { describe, it, expect } from 'vitest';
import { openDb, runMigrations } from '@accessify/core';
import { ensureAdmin } from './bootstrap.js';
import { authenticate } from './auth.js';

describe('admin bootstrap（T506 / ADR-006）', () => {
  it('空系統 → 建立 admin + 一次性隨機密碼 + 強制改密', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const r = await ensureAdmin(db, { cost: 6 });
    expect(r.created).toBe(true);
    expect(r.generatedPassword).toBeTruthy();
    const auth = await authenticate(db, 'admin', r.generatedPassword!);
    expect(auth.ok).toBe(true);
    expect(auth.mustChangePassword).toBe(true);
  });

  it('已有 admin → 不重建', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    await ensureAdmin(db, { cost: 6 });
    expect((await ensureAdmin(db, { cost: 6 })).created).toBe(false);
  });

  it('提供密碼 → 不回傳 generated、不強制改密', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const r = await ensureAdmin(db, { username: 'root', password: 'provided-pw', cost: 6 });
    expect(r.generatedPassword).toBeUndefined();
    expect((await authenticate(db, 'root', 'provided-pw')).mustChangePassword).toBe(false);
  });
});
