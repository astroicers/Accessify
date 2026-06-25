// @accessify/core/diff — 掃描差異比對（T602 / FR-502）
// 將本次掃描與「同 target 前一次 completed 掃描」比對，分類問題為 fixed / added / unchanged。
// 穩定識別鍵 = 頁面 URL + WCAG + 規則碼 + selector（以 JSON.stringify 串接，避免分隔字元落入欄位造成碰撞）；
// 刻意不含 engine/severity，以免引擎回報組合或嚴重度推估變動造成假差異。
// selector 跨 render 可能不穩 → UI 誠實標示「與前次比對，僅供追蹤參考」。

import type { Db } from './db.js';

export interface DiffIssue {
  pageUrl: string;
  wcagRef: string | null;
  ruleCode: string;
  severity: string;
  selector: string | null;
  message: string | null;
}

export interface ScanDiff {
  scanTaskId: number;
  baselineScanId: number | null;
  fixed: DiffIssue[];
  added: DiffIssue[];
  unchanged: DiffIssue[];
}

function loadIssues(db: Db, scanTaskId: number): DiffIssue[] {
  return db
    .prepare(
      `SELECT p.url AS pageUrl, i.wcag_ref AS wcagRef, i.rule_code AS ruleCode,
              i.severity AS severity, i.selector AS selector, i.message AS message
       FROM issues i JOIN pages p ON p.id = i.page_id
       WHERE p.scan_task_id = ?
       ORDER BY p.url, i.rule_code, i.selector, i.wcag_ref`,
    )
    .all(scanTaskId) as DiffIssue[];
}

function keyOf(i: DiffIssue): string {
  return JSON.stringify([i.pageUrl, i.wcagRef ?? '', i.ruleCode, i.selector ?? '']);
}

/** 比對 scanTaskId 與其同 target 前次 completed 掃描；無前次則 baselineScanId=null（三類皆空）。 */
export function computeDiff(db: Db, scanTaskId: number): ScanDiff {
  const cur = db.prepare('SELECT target FROM scan_tasks WHERE id = ?').get(scanTaskId) as
    | { target: string }
    | undefined;
  if (!cur) throw new Error(`scan_task ${scanTaskId} not found`);

  const baseline = db
    .prepare(
      "SELECT id FROM scan_tasks WHERE target = ? AND id < ? AND status = 'completed' ORDER BY id DESC LIMIT 1",
    )
    .get(cur.target, scanTaskId) as { id: number } | undefined;

  if (!baseline) {
    return { scanTaskId, baselineScanId: null, fixed: [], added: [], unchanged: [] };
  }

  const curMap = new Map<string, DiffIssue>();
  for (const i of loadIssues(db, scanTaskId)) curMap.set(keyOf(i), i);
  const prevMap = new Map<string, DiffIssue>();
  for (const i of loadIssues(db, baseline.id)) prevMap.set(keyOf(i), i);

  const added: DiffIssue[] = [];
  const unchanged: DiffIssue[] = [];
  for (const [k, i] of curMap) (prevMap.has(k) ? unchanged : added).push(i);
  const fixed: DiffIssue[] = [];
  for (const [k, i] of prevMap) if (!curMap.has(k)) fixed.push(i);

  return { scanTaskId, baselineScanId: baseline.id, fixed, added, unchanged };
}
