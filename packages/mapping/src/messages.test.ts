import { describe, it, expect } from 'vitest';
import { localizeFindingMessage } from './messages.js';

describe('localizeFindingMessage（報表說明在地化）', () => {
  it('常見規則（axe id 與 HTMLCS 技術碼）→ 精準 zh-TW', () => {
    expect(localizeFindingMessage('zh-TW', 'image-alt', null, 'Image missing alt')).toContain('替代文字');
    expect(localizeFindingMessage('zh-TW', 'WCAG2AA.Principle3.Guideline3_2.3_2_2.H32.2', null, 'no submit')).toContain('提交按鈕');
    expect(localizeFindingMessage('zh-TW', 'WCAG2AA.Principle4.Guideline4_1.4_1_2.H91.Textarea.Name', null, 'no name')).toContain('標籤');
    expect(localizeFindingMessage('zh-TW', 'color-contrast', null, 'low contrast')).toContain('對比');
  });

  it('未涵蓋規則但有 WCAG 準則 → 以準則中文名兜底（仍中文，不留英文）', () => {
    const msg = localizeFindingMessage('zh-TW', 'some-unknown-rule', '名稱、角色、值', 'English engine text');
    expect(msg).toContain('名稱、角色、值');
    expect(msg).not.toContain('English engine text');
  });

  it('未涵蓋且無準則 → 退回引擎原文', () => {
    expect(localizeFindingMessage('zh-TW', 'totally-unknown', null, 'fallback english')).toBe('fallback english');
  });

  it('en-US → 維持引擎原文（英文）', () => {
    expect(localizeFindingMessage('en-US', 'image-alt', '名稱', 'Image missing alt')).toBe('Image missing alt');
  });
});
