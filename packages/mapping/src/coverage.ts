// @accessify/mapping/coverage — 誠實涵蓋率（FR-303 / ADR-007）
// 明確標示「自動涵蓋 vs 需人工檢測」；不宣稱 100% 合規。

import { WCAG_CRITERIA } from './wcag.js';

export interface CoverageSummary {
  /** 參考表收錄的準則數（非 WCAG 全部準則）。 */
  total: number;
  auto: number;
  partial: number;
  manual: number;
  /** 純自動可判定占比（%）。刻意低於 100，凸顯仍需人工。 */
  autoPercent: number;
  /** 自動 + 部分占比（%）。 */
  autoOrPartialPercent: number;
}

/** 由準則表計算涵蓋率分布。分母為「參考表收錄之 A・AA 準則」（非 WCAG 全集）。 */
export function coverageSummary(): CoverageSummary {
  const total = WCAG_CRITERIA.length;
  const auto = WCAG_CRITERIA.filter((x) => x.coverage === 'auto').length;
  const partial = WCAG_CRITERIA.filter((x) => x.coverage === 'partial').length;
  const manual = WCAG_CRITERIA.filter((x) => x.coverage === 'manual').length;
  return {
    total,
    auto,
    partial,
    manual,
    autoPercent: Math.round((auto / total) * 100),
    autoOrPartialPercent: Math.round(((auto + partial) / total) * 100),
  };
}

/** 報表必附的誠實聲明（雙語）：自動檢測非完整合規，其餘須人工。 */
export const COVERAGE_NOTE = {
  'zh-TW':
    '自動檢測僅能涵蓋部分 WCAG 準則，通過不代表完整符合 WCAG 2.1 AA；標示為「需人工」的準則仍須由人工複檢。本工具定位為人工檢測前的自動化輔助。',
  'en-US':
    'Automated testing covers only a subset of WCAG success criteria; passing does not imply full WCAG 2.1 AA conformance. Criteria marked “manual” still require human review. This tool is an aid prior to manual auditing.',
} as const;
