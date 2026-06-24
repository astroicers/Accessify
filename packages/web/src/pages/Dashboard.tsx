import { useTranslation } from 'react-i18next';

export function Dashboard() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-2xl font-bold">{t('app.name')}</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">{t('app.tagline')}</p>
      {/* 掃描清單 / 建立任務 / 結果 / 報表頁面於 T504 接上 API */}
    </section>
  );
}
