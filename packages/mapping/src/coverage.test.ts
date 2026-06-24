import { describe, it, expect } from 'vitest';
import { coverageSummary, COVERAGE_NOTE } from './coverage.js';

describe('誠實涵蓋率（T203 / FR-303）', () => {
  it('分布加總等於 total，且純自動占比 < 100（誠實，不宣稱 100%）', () => {
    const s = coverageSummary();
    expect(s.auto + s.partial + s.manual).toBe(s.total);
    expect(s.autoPercent).toBeGreaterThan(0);
    expect(s.autoPercent).toBeLessThan(100);
    expect(s.autoOrPartialPercent).toBeLessThanOrEqual(100);
  });

  it('誠實聲明明確指出「不代表完整合規」與需「人工」', () => {
    expect(COVERAGE_NOTE['zh-TW']).toContain('人工');
    expect(COVERAGE_NOTE['zh-TW']).toContain('不代表完整');
    expect(COVERAGE_NOTE['en-US']).toContain('manual');
  });
});
