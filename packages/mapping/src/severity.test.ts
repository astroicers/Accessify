import { describe, it, expect } from 'vitest';
import { severityOf, scoreSite } from './severity.js';

describe('嚴重度與站台分數（T202 / FR-302）', () => {
  it('依引擎 impact 分級', () => {
    expect(severityOf({ impact: 'critical' })).toBe('critical');
    expect(severityOf({ impact: 'serious' })).toBe('high');
    expect(severityOf({ impact: 'moderate' })).toBe('medium');
    expect(severityOf({ impact: 'minor' })).toBe('low');
  });

  it('無 impact（HTMLCS）依 WCAG 等級推估', () => {
    expect(severityOf({ impact: null, level: 'A' })).toBe('high');
    expect(severityOf({ impact: null, level: 'AA' })).toBe('medium');
    expect(severityOf({})).toBe('medium');
  });

  it('scoreSite 確定性、夾限 0–100', () => {
    expect(scoreSite([])).toBe(100);
    expect(scoreSite(['critical', 'high'])).toBe(77); // 100 - 15 - 8
    expect(scoreSite(Array(20).fill('critical') as 'critical'[])).toBe(0);
  });
});
