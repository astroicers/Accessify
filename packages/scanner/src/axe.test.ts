import { describe, it, expect } from 'vitest';
import { normalizeAxe, type AxeResults } from './axe.js';

const sample: AxeResults = {
  violations: [
    {
      id: 'image-alt',
      impact: 'critical',
      tags: ['cat.text-alternatives', 'wcag2a', 'wcag111'],
      help: 'Images must have alternate text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      nodes: [{ target: ['img'] }, { target: ['.logo > img'] }],
    },
    {
      id: 'label',
      impact: 'serious',
      tags: ['wcag2a', 'wcag412'],
      help: 'Form elements must have labels',
      helpUrl: 'https://example/label',
      nodes: [{ target: ['#q'] }],
    },
  ],
};

describe('normalizeAxe → raw findings（ADR-007 / FR-202）', () => {
  it('攤平 violations × nodes 為逐筆 finding', () => {
    const findings = normalizeAxe(sample);
    expect(findings).toHaveLength(3); // 2 + 1 nodes
    expect(findings.every((f) => f.engine === 'axe-core')).toBe(true);
  });

  it('保留 ruleId / impact / selector / message / helpUrl', () => {
    const findings = normalizeAxe(sample);
    const first = findings[0]!;
    expect(first.ruleId).toBe('image-alt');
    expect(first.impact).toBe('critical');
    expect(first.selector).toBe('img');
    expect(first.message).toBe('Images must have alternate text');
    expect(first.helpUrl).toContain('dequeuniversity');
  });

  it('只取 wcag 開頭的 tags 作為 wcagTags', () => {
    const findings = normalizeAxe(sample);
    expect(findings[0]!.wcagTags).toEqual(['wcag2a', 'wcag111']);
    expect(findings[0]!.wcagTags).not.toContain('cat.text-alternatives');
  });

  it('多 target 以空白接成單一 selector', () => {
    const findings = normalizeAxe(sample);
    expect(findings[1]!.selector).toBe('.logo > img');
  });
});
