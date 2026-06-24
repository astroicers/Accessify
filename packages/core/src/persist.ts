// @accessify/core/persist — 掃描結果入庫（FR-204）
// 以 core 自有的 DB-oriented 輸入形狀寫入 pages / issues（與 scanner 解耦）。

import type { Db } from './db.js';

export interface PersistIssue {
  engine: string;
  ruleCode: string;
  wcagRef: string | null;
  /** critical | high | medium | low | hint（issues CHECK）。M2 做正式嚴重度分級。 */
  severity: string;
  selector: string;
  message: string;
}

export interface PersistPage {
  url: string;
  renderStatus: 'pending' | 'ok' | 'failed';
  issues: PersistIssue[];
}

/** 將逐頁掃描結果寫入 pages / issues（單一交易、冪等於呼叫端控制 scanTaskId）。 */
export function persistScan(
  db: Db,
  scanTaskId: number,
  pages: PersistPage[],
): { pages: number; issues: number } {
  const insertPage = db.prepare(
    'INSERT INTO pages (scan_task_id, url, render_status) VALUES (?, ?, ?)',
  );
  const insertIssue = db.prepare(
    `INSERT INTO issues (page_id, engine, rule_code, wcag_ref, severity, selector, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let pageCount = 0;
  let issueCount = 0;
  const apply = db.transaction((ps: PersistPage[]) => {
    for (const p of ps) {
      const info = insertPage.run(scanTaskId, p.url, p.renderStatus);
      const pageId = Number(info.lastInsertRowid);
      pageCount += 1;
      for (const i of p.issues) {
        insertIssue.run(pageId, i.engine, i.ruleCode, i.wcagRef, i.severity, i.selector, i.message);
        issueCount += 1;
      }
    }
  });
  apply(pages);
  return { pages: pageCount, issues: issueCount };
}
