import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 基準站台 golden fixtures 的契約：M1/M2 掃描引擎回歸測試將依賴這些已知期望。
const withViolations = readFileSync('test/fixtures/with-violations.html', 'utf8');
const clean = readFileSync('test/fixtures/clean.html', 'utf8');

describe('基準站台 fixtures（防回歸，T005）', () => {
  it('with-violations 含已知問題：缺 lang、img 無 alt、input 無 label、button 無名稱', () => {
    expect(withViolations).toMatch(/<html>/); // 無 lang 屬性
    expect(withViolations).toMatch(/<img\s+src="[^"]*"\s*\/?>/); // img 無 alt
    expect(withViolations).not.toMatch(/<img[^>]*\balt=/);
    expect(withViolations).toMatch(/<input[^>]*>/);
    expect(withViolations).not.toMatch(/<label/); // 無 label
    expect(withViolations).toMatch(/<button><\/button>/); // 空 button
  });

  it('clean 具備正確語意：lang、alt、label、button 名稱', () => {
    expect(clean).toMatch(/<html lang="zh-TW">/);
    expect(clean).toMatch(/<img[^>]*\balt="[^"]+"/);
    expect(clean).toMatch(/<label\s+for="q">/);
    expect(clean).toMatch(/<button[^>]*>送出<\/button>/);
  });
});
