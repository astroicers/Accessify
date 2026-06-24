import { describe, it, expect } from 'vitest';
import { renderExcel } from './excel.js';
import type { ReportData } from './model.js';

const data: ReportData = {
  lang: 'zh-TW',
  target: 'https://intra.mil',
  generatedAt: '2026-06-24T00:00:00Z',
  siteScore: 73,
  coverage: { autoPercent: 27, autoOrPartialPercent: 79 },
  coverageNote: '誠實聲明',
  issues: [
    {
      pageUrl: 'https://intra.mil/',
      ruleId: 'image-alt',
      engines: 'axe-core',
      wcagSc: '1.1.1',
      wcagName: '非文字內容',
      level: 'A',
      severity: 'critical',
      selector: 'img',
      message: 'needs alt',
    },
  ],
};

describe('Excel 修改清單（T303 / FR-403）', () => {
  it('產生非空、合法的 xlsx（ZIP 容器，magic PK）', async () => {
    const buf = await renderExcel(data);
    expect(buf.length).toBeGreaterThan(0);
    // xlsx 為 ZIP 容器，magic bytes = 'PK'
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
