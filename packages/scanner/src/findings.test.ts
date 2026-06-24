import { describe, it, expect } from 'vitest';
import { mergeFindings, toSuccessCriterion, type Finding } from './findings.js';

const axeImg: Finding = {
  engine: 'axe-core',
  ruleId: 'image-alt',
  impact: 'critical',
  wcagTags: ['wcag2a', 'wcag111'],
  selector: 'img',
  message: 'Images must have alternate text',
};
const htmlcsImg: Finding = {
  engine: 'htmlcs',
  ruleId: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
  impact: null,
  wcagTags: ['1_1_1'],
  selector: 'img',
  message: 'Img element missing alt',
};

describe('mergeFindings 整併去重（ADR-007 / FR-203）', () => {
  it('兩引擎同 WCAG SC + selector → 合併為 1，engines 記錄兩者', () => {
    const merged = mergeFindings([axeImg], [htmlcsImg]);
    expect(merged).toHaveLength(1);
    expect([...merged[0]!.engines].sort()).toEqual(['axe-core', 'htmlcs']);
  });

  it('同 SC 但不同 selector → 不合併', () => {
    const htmlcsBtn: Finding = { ...htmlcsImg, selector: 'button' };
    expect(mergeFindings([axeImg], [htmlcsBtn])).toHaveLength(2);
  });

  it('同引擎完全重複 → 去重為 1', () => {
    expect(mergeFindings([axeImg, { ...axeImg }])).toHaveLength(1);
    expect(mergeFindings([axeImg, { ...axeImg }])[0]!.engines).toEqual(['axe-core']);
  });

  it('toSuccessCriterion 正規化 axe / HTMLCS 兩種形式', () => {
    expect(toSuccessCriterion('wcag111')).toBe('1.1.1');
    expect(toSuccessCriterion('wcag1410')).toBe('1.4.10');
    expect(toSuccessCriterion('1_1_1')).toBe('1.1.1');
    expect(toSuccessCriterion('wcag2aa')).toBeNull();
    expect(toSuccessCriterion('cat.forms')).toBeNull();
  });
});
