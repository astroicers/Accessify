// 前端 i18n（react-i18next）— 共用 @accessify/shared catalog（ADR-004，僅 zh-TW/en-US）

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { localeResources, DEFAULT_LOCALE, FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@accessify/shared';

const STORAGE_KEY = 'accessify.lang';

function initialLang(): string {
  const persisted = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  // 優先序：持久化偏好 > 預設 zh-TW。瀏覽器 Accept-Language 不凌駕預設（ADR-004）。
  if (persisted && (SUPPORTED_LOCALES as readonly string[]).includes(persisted)) return persisted;
  return DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources: localeResources as Record<string, { translation: Record<string, unknown> }>,
  lng: initialLang(),
  fallbackLng: FALLBACK_LOCALE,
  supportedLngs: [...SUPPORTED_LOCALES],
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: string): void {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(lang)) return;
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export default i18n;
