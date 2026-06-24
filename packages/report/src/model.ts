// @accessify/report/model — 報表資料模型（與 scanner/mapping 解耦：呼叫端組裝、已在地化）

import type { Locale } from '@accessify/shared';

export interface ReportIssue {
  pageUrl: string;
  ruleId: string;
  /** 來源引擎（如 'axe-core' / 'axe-core+htmlcs'）。 */
  engines: string;
  wcagSc: string | null;
  /** WCAG 準則名稱（已依 lang 在地化）。 */
  wcagName: string | null;
  level: string | null;
  /** 嚴重度 key：critical/high/medium/low/hint（報表以 i18n 顯示）。 */
  severity: string;
  selector: string;
  message: string;
}

export interface ReportData {
  lang: Locale;
  target: string;
  generatedAt: string;
  siteScore: number;
  coverage: { autoPercent: number; autoOrPartialPercent: number };
  /** 誠實涵蓋率聲明（已在地化，來自 mapping.COVERAGE_NOTE[lang]）。 */
  coverageNote: string;
  issues: ReportIssue[];
}
