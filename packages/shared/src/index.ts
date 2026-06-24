// @accessify/shared — 共用型別、i18n catalog、工具
// 語言集合固定，僅 zh-TW（預設）與 en-US（fallback），見 ADR-004。

export const PACKAGE = '@accessify/shared' as const;

/** 支援語系（固定，不可擴充）：zh-TW 預設、en-US fallback。 */
export const SUPPORTED_LOCALES = ['zh-TW', 'en-US'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** 預設語系（ADR-004）。 */
export const DEFAULT_LOCALE: Locale = 'zh-TW';

/** Fallback 語系（ADR-004）。 */
export const FALLBACK_LOCALE: Locale = 'en-US';

export interface AccessifyInfo {
  readonly name: 'Accessify';
  readonly defaultLocale: Locale;
  readonly locales: readonly Locale[];
}

/** 產品基本資訊（供啟動健康檢查與 about 頁使用）。 */
export function accessifyInfo(): AccessifyInfo {
  return {
    name: 'Accessify',
    defaultLocale: DEFAULT_LOCALE,
    locales: SUPPORTED_LOCALES,
  };
}

// i18n 基礎框架（ADR-004）
export * from './i18n/index.js';
