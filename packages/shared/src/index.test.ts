import { describe, it, expect } from 'vitest';
import { accessifyInfo, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './index.js';

describe('@accessify/shared', () => {
  it('只支援 zh-TW 與 en-US，預設 zh-TW（ADR-004）', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-TW', 'en-US']);
    expect(DEFAULT_LOCALE).toBe('zh-TW');
  });

  it('accessifyInfo() 回傳產品基本資訊', () => {
    const info = accessifyInfo();
    expect(info.name).toBe('Accessify');
    expect(info.defaultLocale).toBe('zh-TW');
    expect(info.locales).toEqual(['zh-TW', 'en-US']);
  });
});
