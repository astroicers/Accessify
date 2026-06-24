// @accessify/report/html — i18n HTML 報表（T301 / FR-401）
// 雙語 chrome 走 @accessify/shared i18next；不可信內容（selector/message/url）一律 HTML 轉義。

import { createI18n } from '@accessify/shared';
import type { ReportData } from './model.js';

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESC[ch]!);
}

const STYLE = `
  body{font-family:'Inter','Noto Sans TC',system-ui,sans-serif;margin:24px;color:#111827}
  h1{font-size:22px} h2{font-size:16px;margin-top:24px}
  dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px}
  dt{color:#6b7280} table{border-collapse:collapse;width:100%;margin-top:8px}
  th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;font-size:13px;vertical-align:top}
  th{background:#f3f4f6} code{font-family:'Fira Code',monospace;font-size:12px}
  .note{background:#fef9c3;border:1px solid #fde047;padding:8px;border-radius:4px}
  .sev-critical{color:#b91c1c;font-weight:600}.sev-high{color:#c2410c;font-weight:600}
  .sev-medium{color:#a16207}.sev-low{color:#3f6212}.sev-hint{color:#6b7280}
`;

export function renderHtmlReport(data: ReportData): string {
  const i18n = createI18n(data.lang);
  const t = (k: string): string => String(i18n.t(k));

  const rows = data.issues
    .map(
      (iss) => `      <tr>
        <td>${esc(iss.pageUrl)}</td>
        <td>${esc(iss.wcagSc ?? '')}${iss.wcagName ? ` ${esc(iss.wcagName)}` : ''}</td>
        <td>${esc(iss.level ?? '')}</td>
        <td class="sev-${esc(iss.severity)}">${esc(t(`severity.${iss.severity}`))}</td>
        <td><code>${esc(iss.selector)}</code></td>
        <td>${esc(iss.message)}</td>
        <td>${esc(iss.engines)}</td>
      </tr>`,
    )
    .join('\n');

  const table =
    data.issues.length === 0
      ? `<p>${esc(t('report.noIssues'))}</p>`
      : `<table><thead><tr>
        <th>${esc(t('report.pageUrl'))}</th><th>${esc(t('report.wcagCriterion'))}</th><th>${esc(t('report.level'))}</th>
        <th>${esc(t('report.severity'))}</th><th>${esc(t('report.selector'))}</th><th>${esc(t('report.message'))}</th><th>${esc(t('report.engine'))}</th>
      </tr></thead><tbody>
${rows}
      </tbody></table>`;

  return `<!doctype html>
<html lang="${data.lang}">
<head><meta charset="utf-8"><title>${esc(t('report.title'))}</title><style>${STYLE}</style></head>
<body>
  <h1>${esc(t('report.title'))}</h1>
  <dl>
    <dt>${esc(t('report.target'))}</dt><dd>${esc(data.target)}</dd>
    <dt>${esc(t('report.generatedAt'))}</dt><dd>${esc(data.generatedAt)}</dd>
    <dt>${esc(t('report.siteScore'))}</dt><dd>${data.siteScore}</dd>
    <dt>${esc(t('report.totalIssues'))}</dt><dd>${data.issues.length}</dd>
  </dl>
  <section>
    <h2>${esc(t('report.coverageTitle'))}</h2>
    <p>${esc(t('report.autoCovered'))}: ${data.coverage.autoPercent}% · ${esc(t('report.autoOrPartial'))}: ${data.coverage.autoOrPartialPercent}%</p>
    <p class="note">${esc(data.coverageNote)}</p>
  </section>
  <h2>${esc(t('report.totalIssues'))}</h2>
  ${table}
</body>
</html>`;
}
