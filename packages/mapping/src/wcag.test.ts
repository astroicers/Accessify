import { describe, it, expect } from 'vitest';
import { toSuccessCriterion, resolveCriterion, mapTagsToCriteria, WCAG_CRITERIA } from './wcag.js';

describe('WCAG 對應（T201 / FR-301）', () => {
  it('toSuccessCriterion 正規化 axe / HTMLCS 形式', () => {
    expect(toSuccessCriterion('wcag111')).toBe('1.1.1');
    expect(toSuccessCriterion('1_1_1')).toBe('1.1.1');
    expect(toSuccessCriterion('wcag1410')).toBe('1.4.10');
    expect(toSuccessCriterion('wcag2aa')).toBeNull();
  });

  it('resolveCriterion 取得等級 / 涵蓋類別 / 雙語名稱', () => {
    const crit = resolveCriterion('1.1.1');
    expect(crit?.level).toBe('A');
    expect(crit?.coverage).toBe('auto');
    expect(crit?.name['zh-TW']).toBe('非文字內容');
    expect(crit?.name['en-US']).toBe('Non-text Content');
    expect(resolveCriterion('9.9.9')).toBeUndefined();
  });

  it('mapTagsToCriteria：由引擎 tags 解析準則、去重、表外略過', () => {
    const cs = mapTagsToCriteria(['wcag2a', 'wcag111', '1_1_1', 'wcag999']);
    expect(cs.map((x) => x.sc)).toEqual(['1.1.1']);
  });

  it('表內每個準則等級皆為 A 或 AA', () => {
    expect(WCAG_CRITERIA.every((c) => c.level === 'A' || c.level === 'AA')).toBe(true);
  });
});
