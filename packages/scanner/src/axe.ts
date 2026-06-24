// @accessify/scanner/axe — axe-core 注入與結果正規化（ADR-007 / FR-202）
// axe-core（MPL-2.0）以未修改之形式注入頁面執行；輸出正規化為 raw Finding。

import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { Finding } from './findings.js';

export interface AxeNode {
  target: string[];
}

export interface AxeViolation {
  id: string;
  impact?: string | null;
  tags: string[];
  help: string;
  helpUrl?: string;
  nodes: AxeNode[];
}

export interface AxeResults {
  violations: AxeViolation[];
}

/** 將 axe 結果攤平為逐筆 finding（純函式，便於單元測試）。 */
export function normalizeAxe(results: AxeResults): Finding[] {
  const findings: Finding[] = [];
  for (const v of results.violations) {
    for (const node of v.nodes) {
      findings.push({
        engine: 'axe-core',
        ruleId: v.id,
        impact: v.impact ?? null,
        wcagTags: (v.tags ?? []).filter((t) => t.startsWith('wcag')),
        selector: node.target.join(' '),
        message: v.help,
        helpUrl: v.helpUrl,
      });
    }
  }
  return findings;
}

/** 對已渲染的頁面注入 axe-core 並執行，回傳正規化 findings。 */
export async function runAxe(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return normalizeAxe(results as unknown as AxeResults);
}
