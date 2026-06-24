// @accessify/core/storage — 報表本地檔案系統儲存（T403 / FR-404 / ADR-002）
// 報表存於本地 volume（非物件儲存）；以租戶無關的 scan_task 子目錄分層。

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.js';

export type ReportFormat = 'html' | 'pdf' | 'xlsx';

export interface SaveReportInput {
  baseDir: string;
  scanTaskId: number;
  lang: string;
  format: ReportFormat;
  content: Buffer | string;
}

/** 將報表寫入本地檔案並登錄 reports 表；回傳檔案路徑。 */
export function saveReport(db: Db, input: SaveReportInput): string {
  const dir = join(input.baseDir, String(input.scanTaskId));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `report-${input.lang}.${input.format}`);
  writeFileSync(path, input.content);
  db.prepare('INSERT INTO reports (scan_task_id, lang, format, path) VALUES (?, ?, ?, ?)').run(
    input.scanTaskId,
    input.lang,
    input.format,
    path,
  );
  return path;
}
