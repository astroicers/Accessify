// @accessify/shared/i18n — i18next 基礎框架（ADR-004）
// 僅 zh-TW（預設）與 en-US（fallback）；前端 / 後端 / 報表共用同一 catalog。

import i18next, { type i18n as I18nInstance } from 'i18next';
import zhTW from '../../locales/zh-TW.json';
import enUS from '../../locales/en-US.json';
import { DEFAULT_LOCALE, FALLBACK_LOCALE, SUPPORTED_LOCALES, type Locale } from '../index.js';

const resources = {
  'zh-TW': { translation: zhTW },
  'en-US': { translation: enUS },
} as const;

/** 建立一個獨立的 i18next 實例（避免跨請求/跨元件共用可變狀態）。 */
export function createI18n(lng: Locale = DEFAULT_LOCALE): I18nInstance {
  const instance = i18next.createInstance();
  // 內聯 resources、無非同步 backend → init 同步完成，t() 立即可用。
  void instance.init({
    lng,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    resources,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return instance;
}

/** 型別守衛：值是否為支援語系。 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export interface ResolveLocaleInput {
  /** 使用者持久化偏好（最高優先）。 */
  persisted?: string | null;
  /** 明確指定（如 ?lang 查詢參數）。 */
  explicit?: string | null;
}

/**
 * 語言解析優先序（ADR-004）：
 * 持久化偏好 > 明確 ?lang > 預設 zh-TW。
 * 注意：瀏覽器 Accept-Language **不得凌駕**預設 zh-TW，故不在此參與判定。
 */
export function resolveLocale(input: ResolveLocaleInput = {}): Locale {
  if (isLocale(input.persisted)) return input.persisted;
  if (isLocale(input.explicit)) return input.explicit;
  return DEFAULT_LOCALE;
}
