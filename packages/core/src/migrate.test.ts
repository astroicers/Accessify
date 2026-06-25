import { describe, it, expect } from 'vitest';
import { openDb, runMigrations, MIGRATIONS } from './index.js';

describe('runMigrations（併發安全 + fail-closed，T703 強化）', () => {
  it('首次套用回傳遷移數；重跑冪等回 0', () => {
    const db = openDb(':memory:');
    expect(runMigrations(db)).toBe(MIGRATIONS.length);
    expect(runMigrations(db)).toBe(0);
  });

  it('DB schema_version 高於執行檔已知版本 → fail-closed 拋錯（回滾安全）', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const maxKnown = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 0);
    db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
      maxKnown + 1,
      'from-newer-binary',
      '2026-06-25T00:00:00.000Z',
    );
    expect(() => runMigrations(db)).toThrow(/高於本執行檔支援/);
  });
});
