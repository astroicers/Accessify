import { useTranslation } from 'react-i18next';

// 狀態徽章：顏色僅為輔助，文字必達意（WCAG 1.4.1 不以顏色單獨傳達資訊）。
const STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  running: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  completed: 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
  failed: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls = STYLES[status] ?? STYLES.queued;
  const known = ['queued', 'running', 'completed', 'failed'].includes(status);
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {known ? t(`scan.${status}`) : status}
    </span>
  );
}
