// @accessify/mapping/severity — 嚴重度分級與站台分數（FR-302）

import type { WcagLevel } from './wcag.js';

/** 嚴重 / 高 / 中 / 低 / 提示。 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'hint';

const IMPACT_MAP: Record<string, Severity> = {
  critical: 'critical',
  serious: 'high',
  moderate: 'medium',
  minor: 'low',
};

export interface SeverityInput {
  /** 引擎 impact（axe：critical/serious/moderate/minor）；HTMLCS 無，傳 null。 */
  impact?: string | null;
  /** 對應 WCAG 等級（供無 impact 時推估）。 */
  level?: WcagLevel;
}

/** 嚴重度分級：優先用引擎 impact；無 impact（如 HTMLCS）依 WCAG 等級推估（A→高、AA→中）。 */
export function severityOf(input: SeverityInput): Severity {
  const mapped = input.impact ? IMPACT_MAP[input.impact] : undefined;
  if (mapped) return mapped;
  if (input.level === 'A') return 'high';
  if (input.level === 'AA') return 'medium';
  return 'medium';
}

const PENALTY: Record<Severity, number> = {
  critical: 15,
  high: 8,
  medium: 4,
  low: 1,
  hint: 0.5,
};

/** 站台分數（0–100，越高越好）：依嚴重度加權扣分後夾限。確定性、可重現。 */
export function scoreSite(severities: Severity[]): number {
  const penalty = severities.reduce((sum, s) => sum + PENALTY[s], 0);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}
