import { describe, it, expect } from 'vitest';
import { scanSite } from './scan.js';
import type { MergedFinding } from './findings.js';

const fakeFinding = (sel: string): MergedFinding => ({
  engine: 'axe-core',
  engines: ['axe-core'],
  ruleId: 'r',
  impact: 'critical',
  wcagTags: ['wcag111'],
  selector: sel,
  message: 'm',
});

describe('scanSite 編排（FR-204）', () => {
  it('逐頁掃描、回傳結構化結果', async () => {
    const result = await scanSite(['https://a/1', 'https://a/2'], {
      scanOne: async (url) => [fakeFinding(url)],
    });
    expect(result.pages).toHaveLength(2);
    expect(result.pages.every((p) => p.ok)).toBe(true);
    expect(result.pages[0]!.findings).toHaveLength(1);
  });

  it('單頁失敗隔離：壞頁標記 ok=false 並續掃其他頁', async () => {
    const result = await scanSite(['https://a/ok', 'https://a/bad', 'https://a/ok2'], {
      scanOne: async (url) => {
        if (url.includes('bad')) throw new Error('render timeout');
        return [fakeFinding(url)];
      },
    });
    expect(result.pages.map((p) => p.ok)).toEqual([true, false, true]);
    expect(result.pages[1]!.error).toContain('render timeout');
    expect(result.pages[1]!.findings).toEqual([]);
  });

  it('套用 maxPages 上限', async () => {
    const result = await scanSite(['https://a/1', 'https://a/2', 'https://a/3'], {
      scanOne: async () => [],
      maxPages: 2,
    });
    expect(result.pages).toHaveLength(2);
  });
});
