import { describe, it, expect } from 'vitest';
import { normalizeHtmlcs, type RawHtmlcsMessage } from './htmlcs.js';

const raw: RawHtmlcsMessage[] = [
  { type: 1, code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37', msg: 'Img must have alt', selector: 'img' },
  { type: 3, code: 'WCAG2AA.Principle1.Guideline1_3.1_3_1.G141', msg: 'notice', selector: 'div' },
  { type: 1, code: 'WCAG2AA.Principle4.Guideline4_1.4_1_2.H91', msg: 'button name', selector: 'button' },
];

describe('normalizeHtmlcs（ADR-007 / FR-203）', () => {
  it('僅取 Error(type=1)，正規化為 htmlcs finding 並抽出 WCAG SC', () => {
    const findings = normalizeHtmlcs(raw);
    expect(findings).toHaveLength(2); // type=3 notice 被濾掉
    expect(findings.every((f) => f.engine === 'htmlcs')).toBe(true);
    expect(findings[0]!.wcagTags).toEqual(['1_1_1']);
    expect(findings[0]!.selector).toBe('img');
    expect(findings[0]!.ruleId).toContain('H37');
    expect(findings[1]!.wcagTags).toEqual(['4_1_2']);
  });
});
