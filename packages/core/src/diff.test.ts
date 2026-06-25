import { describe, it, expect } from 'vitest';
import { openDb, runMigrations, persistScan, type Db } from './index.js';
import { computeDiff } from './diff.js';

function seed(): Db {
  const db = openDb(':memory:');
  runMigrations(db);
  return db;
}
function issue(ruleCode: string, selector: string) {
  return { engine: 'axe', ruleCode, wcagRef: '1.1.1', severity: 'high', selector, message: ruleCode };
}
function makeScan(db: Db, target: string, issues: ReturnType<typeof issue>[]): number {
  const id = Number(
    db.prepare("INSERT INTO scan_tasks (target, type, status) VALUES (?, 'url', 'completed')").run(target).lastInsertRowid,
  );
  persistScan(db, id, [{ url: `http://${target}/`, renderStatus: 'ok', issues }]);
  return id;
}

describe('computeDiff（T602 / 掃描差異）', () => {
  it('分類 fixed / added / unchanged，baseline 為同 target 前次 completed', () => {
    const db = seed();
    const A = issue('image-alt', 'img.a');
    const B = issue('label', 'input#b');
    const C = issue('contrast', '.c');
    const t1 = makeScan(db, 'x.mil', [A, B]);
    const t2 = makeScan(db, 'x.mil', [B, C]);
    const d = computeDiff(db, t2);
    expect(d.baselineScanId).toBe(t1);
    expect(d.added.map((i) => i.ruleCode)).toEqual(['contrast']);
    expect(d.fixed.map((i) => i.ruleCode)).toEqual(['image-alt']);
    expect(d.unchanged.map((i) => i.ruleCode)).toEqual(['label']);
  });

  it('無前次掃描 → baselineScanId null，三類皆空', () => {
    const db = seed();
    const t1 = makeScan(db, 'solo.mil', [issue('image-alt', 'img.a')]);
    const d = computeDiff(db, t1);
    expect(d.baselineScanId).toBeNull();
    expect(d.added).toEqual([]);
    expect(d.fixed).toEqual([]);
    expect(d.unchanged).toEqual([]);
  });

  it('不同 target 不互相比對', () => {
    const db = seed();
    makeScan(db, 'a.mil', [issue('image-alt', 'img.a')]);
    const t2 = makeScan(db, 'b.mil', [issue('label', 'input#b')]);
    expect(computeDiff(db, t2).baselineScanId).toBeNull();
  });
});
