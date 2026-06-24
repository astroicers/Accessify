/* eslint-disable i18next/no-literal-string -- 選項為語言 endonym（繁體中文 / English），刻意不經 i18n */
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n.js';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <select
      aria-label={t('common.language')}
      value={i18n.language}
      onChange={(e) => setLanguage(e.target.value)}
      className="rounded border border-gray-300 bg-transparent px-2 py-1 text-sm"
    >
      <option value="zh-TW">繁體中文</option>
      <option value="en-US">English</option>
    </select>
  );
}
