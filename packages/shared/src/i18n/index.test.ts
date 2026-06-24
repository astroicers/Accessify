import { describe, it, expect } from 'vitest';
import { createI18n, resolveLocale, isLocale } from './index.js';

describe('@accessify/shared i18n（ADR-004）', () => {
  it('預設 zh-TW，t() 取得繁中文案', () => {
    const i = createI18n();
    expect(i.language).toBe('zh-TW');
    expect(i.t('app.name')).toBe('Accessify');
    expect(i.t('common.save')).toBe('儲存');
  });

  it('指定 en-US 取得英文文案', () => {
    const i = createI18n('en-US');
    expect(i.t('common.save')).toBe('Save');
  });

  it('changeLanguage 後文案切換', () => {
    const i = createI18n();
    i.changeLanguage('en-US');
    expect(i.t('common.cancel')).toBe('Cancel');
  });

  it('resolveLocale 優先序：持久化 > 明確 ?lang > 預設 zh-TW（Accept-Language 不凌駕）', () => {
    expect(resolveLocale({ persisted: 'en-US' })).toBe('en-US');
    expect(resolveLocale({ explicit: 'en-US' })).toBe('en-US');
    expect(resolveLocale({ persisted: 'en-US', explicit: 'zh-TW' })).toBe('en-US');
    expect(resolveLocale({})).toBe('zh-TW');
    expect(resolveLocale({ persisted: 'fr-FR', explicit: 'ja-JP' })).toBe('zh-TW');
  });

  it('isLocale 僅認 zh-TW / en-US', () => {
    expect(isLocale('zh-TW')).toBe(true);
    expect(isLocale('en-US')).toBe(true);
    expect(isLocale('fr-FR')).toBe(false);
    expect(isLocale(123)).toBe(false);
  });
});
