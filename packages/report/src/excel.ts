// @accessify/report/excel — Excel 修改清單（T303 / FR-403）
// ExcelJS（純 JS，離線）；每問題一列 + 可追蹤的「狀態」欄供機關回報修正。

import ExcelJS from 'exceljs';
import { createI18n } from '@accessify/shared';
import type { ReportData } from './model.js';

export async function renderExcel(data: ReportData): Promise<Buffer<ArrayBuffer>> {
  const i18n = createI18n(data.lang);
  const t = (k: string): string => String(i18n.t(k));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Accessify';

  const summary = wb.addWorksheet(t('report.title').slice(0, 28));
  summary.addRow([t('report.target'), data.target]);
  summary.addRow([t('report.generatedAt'), data.generatedAt]);
  summary.addRow([t('report.siteScore'), data.siteScore]);
  summary.addRow([t('report.autoCovered'), `${data.coverage.autoPercent}%`]);
  summary.addRow([t('report.autoOrPartial'), `${data.coverage.autoOrPartialPercent}%`]);
  summary.addRow([t('report.coverageTitle'), data.coverageNote]);

  const sheet = wb.addWorksheet(t('report.totalIssues').slice(0, 28));
  const header = [
    t('report.pageUrl'),
    t('report.wcagCriterion'),
    t('report.level'),
    t('report.severity'),
    t('report.selector'),
    t('report.message'),
    t('report.engine'),
    'Status',
  ];
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true };
  for (const iss of data.issues) {
    sheet.addRow([
      iss.pageUrl,
      `${iss.wcagSc ?? ''}${iss.wcagName ? ` ${iss.wcagName}` : ''}`.trim(),
      iss.level ?? '',
      t(`severity.${iss.severity}`),
      iss.selector,
      iss.message,
      iss.engines,
      '',
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
