import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type Notification } from '../lib/api.js';
import { useNotify } from '../store.js';

export function Notifications() {
  const { t } = useTranslation();
  const refreshUnread = useNotify((s) => s.refresh);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState('');

  const load = useCallback(() => {
    setError(null);
    api
      .listNotifications()
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
    void refreshUnread();
  }, [refreshUnread]);
  useEffect(load, [load]);

  function renderMsg(n: Notification): string {
    let params: Record<string, unknown> | undefined;
    try {
      params = n.params_json ? (JSON.parse(n.params_json) as Record<string, unknown>) : undefined;
    } catch {
      params = undefined;
    }
    return t(n.message_key, params);
  }
  function fmtTime(s: string): string {
    // created_at 為 datetime('now')（UTC、空白格式）→ 轉 ISO-T-Z 後在地化顯示。
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
  }

  // 標記後將焦點移回 <main>（避免被移除的按鈕造成焦點孤立，WCAG 2.4.3）並播報結果（4.1.3）。
  function afterMark() {
    load();
    setDone(t('notifications.marked'));
    document.getElementById('main')?.focus();
  }
  async function markOne(n: Notification) {
    try {
      await api.markNotificationRead(n.id);
      afterMark();
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    }
  }
  async function markAll() {
    try {
      await api.markAllNotificationsRead();
      afterMark();
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    }
  }

  return (
    <section className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
        {items && items.some((n) => !n.read) && (
          <button
            type="button"
            onClick={markAll}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {/* 持久 polite live region：標記已讀後播報（WCAG 4.1.3 狀態訊息）。 */}
      <p role="status" className="sr-only">
        {done}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {t(error)}
        </p>
      )}
      {!items && !error && (
        <p className="mt-4 text-gray-600 dark:text-gray-400" aria-busy="true">
          {t('common.loading')}
        </p>
      )}
      {items && items.length === 0 && (
        <p className="mt-4 text-gray-600 dark:text-gray-400">{t('notifications.empty')}</p>
      )}
      {items && items.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-900">
          {items.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className={n.read ? 'text-gray-600 dark:text-gray-400' : 'font-medium'}>{renderMsg(n)}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{fmtTime(n.created_at)}</p>
                {n.scan_task_id != null && (
                  <a
                    href={`#/scans/${n.scan_task_id}`}
                    className="text-sm text-blue-700 underline hover:no-underline dark:text-blue-400"
                  >
                    {t('notifications.viewScan')}
                  </a>
                )}
              </div>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => markOne(n)}
                  className="whitespace-nowrap text-sm text-blue-700 underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-400"
                >
                  {t('notifications.markRead')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
