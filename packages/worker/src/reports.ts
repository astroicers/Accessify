// @accessify/worker/reports — 掃描結果 → 嚴重度/分數/涵蓋率 → 入庫 → 雙語六報表（T403/T602 整合）
// 純組合邏輯（不啟瀏覽器）；toPdf 注入以利單元測試。renderHtmlReport/renderExcel 內部各自 createI18n。

import { persistScan, saveReport, type Db, type PersistPage } from '@accessify/core';
import {
  severityOf,
  scoreSite,
  coverageSummary,
  resolveCriterion,
  toSuccessCriterion,
  localizeFindingMessage,
  COVERAGE_NOTE,
  type Severity,
} from '@accessify/mapping';
import { renderHtmlReport, renderExcel, type ReportData, type ReportIssue } from '@accessify/report';
import { SUPPORTED_LOCALES, type Locale } from '@accessify/shared';
import type { SiteScanResult, MergedFinding } from '@accessify/scanner';

interface Mapped {
  finding: MergedFinding;
  sc: string | null;
  level: string | null;
  severity: Severity;
}

function mapFinding(f: MergedFinding): Mapped {
  const sc = f.wcagTags.map(toSuccessCriterion).find((x) => x !== null) ?? null;
  const crit = sc ? resolveCriterion(sc) : undefined;
  return { finding: f, sc, level: crit?.level ?? null, severity: severityOf({ impact: f.impact, level: crit?.level }) };
}

export interface BuildReportsDeps {
  reportsBaseDir: string;
  toPdf: (html: string) => Promise<Buffer>;
  generatedAt: string;
}

export interface BuildReportsResult {
  pages: number;
  issues: number;
  reports: number;
}

/** 將一次掃描結果入庫並產出 zh-TW/en-US × html/pdf/xlsx 六份報表。 */
export async function buildReports(
  db: Db,
  scanTaskId: number,
  target: string,
  site: SiteScanResult,
  deps: BuildReportsDeps,
): Promise<BuildReportsResult> {
  const mappedPages = site.pages.map((p) => ({ page: p, items: p.findings.map(mapFinding) }));
  const allSeverities: Severity[] = mappedPages.flatMap((mp) => mp.items.map((i) => i.severity));

  // 冪等：清除本任務前次寫入（job 在報表階段失敗後會重試，避免 pages/issues/reports 重複累積）。
  // issues 經 FK ON DELETE CASCADE 隨 pages 一併刪除。報表檔以相同路徑覆寫，僅需清 DB 列。
  db.prepare('DELETE FROM reports WHERE scan_task_id = ?').run(scanTaskId);
  db.prepare('DELETE FROM pages WHERE scan_task_id = ?').run(scanTaskId);

  // 入庫（pages / issues，單一交易）。
  const persistPages: PersistPage[] = mappedPages.map(({ page, items }) => ({
    url: page.url,
    renderStatus: page.ok ? 'ok' : 'failed',
    issues: items.map(({ finding, sc, severity }) => ({
      engine: finding.engines.join('+'),
      ruleCode: finding.ruleId,
      wcagRef: sc,
      severity,
      selector: finding.selector,
      message: finding.message,
    })),
  }));
  const persisted = persistScan(db, scanTaskId, persistPages);

  const siteScore = scoreSite(allSeverities);
  const cov = coverageSummary();

  let reports = 0;
  for (const lang of SUPPORTED_LOCALES as readonly Locale[]) {
    const issues: ReportIssue[] = mappedPages.flatMap(({ page, items }) =>
      items.map(({ finding, sc, level, severity }) => {
        const crit = sc ? resolveCriterion(sc) : undefined;
        return {
          pageUrl: page.url,
          ruleId: finding.ruleId,
          engines: finding.engines.join('+'),
          wcagSc: sc,
          wcagName: crit ? crit.name[lang] : null,
          level,
          severity,
          selector: finding.selector,
          message: localizeFindingMessage(lang, finding.ruleId, crit ? crit.name[lang] : null, finding.message),
        };
      }),
    );
    const data: ReportData = {
      lang,
      target,
      generatedAt: deps.generatedAt,
      siteScore,
      coverage: { autoPercent: cov.autoPercent, autoOrPartialPercent: cov.autoOrPartialPercent },
      coverageNote: COVERAGE_NOTE[lang],
      issues,
    };
    const html = renderHtmlReport(data);
    saveReport(db, { baseDir: deps.reportsBaseDir, scanTaskId, lang, format: 'html', content: html });
    reports++;
    saveReport(db, { baseDir: deps.reportsBaseDir, scanTaskId, lang, format: 'pdf', content: await deps.toPdf(html) });
    reports++;
    saveReport(db, { baseDir: deps.reportsBaseDir, scanTaskId, lang, format: 'xlsx', content: await renderExcel(data) });
    reports++;
  }

  return { pages: persisted.pages, issues: persisted.issues, reports };
}
