import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type ScanTask } from '../lib/api.js';
import { useAuth } from '../store.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function Dashboard() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  const [scans, setScans] = useState<ScanTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listScans()
      .then((rows) => alive && setScans(rows))
      .catch((err) => alive && setError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('scan.listTitle')}</h1>
        {role === 'admin' && (
          <a
            href="#/scans/new"
            className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t('scan.create')}
          </a>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {t(error)}
        </p>
      )}

      {!scans && !error && (
        <p className="mt-4 text-gray-600 dark:text-gray-400" aria-busy="true">
          {t('common.loading')}
        </p>
      )}

      {scans && scans.length === 0 && (
        <p className="mt-4 text-gray-600 dark:text-gray-400">{t('scan.noScans')}</p>
      )}

      {scans && scans.length > 0 && (
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <caption className="sr-only">{t('scan.listTitle')}</caption>
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th scope="col" className="py-2 pr-4 font-semibold">{t('scan.target')}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t('scan.type')}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t('scan.status')}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t('scan.created')}</th>
              <th scope="col" className="py-2 font-semibold">{t('scan.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2 pr-4 break-all">{s.target}</td>
                <td className="py-2 pr-4">{t(`scan.${s.type}`)}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={s.status} />
                </td>
                <td className="py-2 pr-4 whitespace-nowrap text-gray-600 dark:text-gray-400">
                  {s.created_at}
                </td>
                <td className="py-2">
                  <a
                    href={`#/scans/${s.id}`}
                    className="text-blue-700 underline hover:no-underline dark:text-blue-400"
                  >
                    {t('scan.view')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
