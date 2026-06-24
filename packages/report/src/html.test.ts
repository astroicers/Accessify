import { describe, it, expect } from 'vitest';
import { renderHtmlReport } from './html.js';
import type { ReportData } from './model.js';

const base = (lang: 'zh-TW' | 'en-US'): ReportData => ({
  lang,
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
      message: '<script>x</script> needs alt',
    },
  ],
});

describe('HTML 報表（T301 / FR-401）', () => {
  it('zh-TW：標題、嚴重度在地化、WCAG SC、lang 屬性', () => {
    const h = renderHtmlReport(base('zh-TW'));
    expect(h).toContain('無障礙檢測報告');
    expect(h).toContain('嚴重'); // severity.critical zh-TW
    expect(h).toContain('1.1.1');
    expect(h).toContain('lang="zh-TW"');
  });

  it('en-US：英文標題與嚴重度', () => {
    const h = renderHtmlReport(base('en-US'));
    expect(h).toContain('Accessibility Report');
    expect(h).toContain('Critical');
  });

  it('不可信內容一律 HTML 轉義（防 XSS）', () => {
    const h = renderHtmlReport(base('zh-TW'));
    expect(h).toContain('&lt;script&gt;x&lt;/script&gt; needs alt');
    expect(h).not.toContain('<script>x</script>');
  });

  it('涵蓋率誠實標示（27%）與聲明', () => {
    const h = renderHtmlReport(base('zh-TW'));
    expect(h).toContain('27%');
    expect(h).toContain('誠實聲明');
  });
});
