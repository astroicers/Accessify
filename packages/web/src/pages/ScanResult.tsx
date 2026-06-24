import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  ApiError,
  reportDownloadUrl,
  type Issue,
  type IssueCount,
  type ScanTask,
} from '../lib/api.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface Report {
  id: number;
  lang: string;
  format: string;
  created_at: string;
}

export function ScanResult({ id }: { id: number }) {
  const { t } = useTranslation();
  const [task, setTask] = useState<(ScanTask & { issueCounts: IssueCount[] }) | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.getScan(id), api.getIssues(id), api.getReports(id)])
      .then(([scan, iss, rep]) => {
        setTask(scan);
        setIssues(iss);
        setReports(rep as Report[]);
      })
      .catch((err) => setError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <section>
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(error)}
        </p>
        <a href="#/" className="mt-3 inline-block text-blue-700 underline dark:text-blue-400">
          {t('scan.back')}
        </a>
      </section>
    );
  }

  if (!task) {
    return (
      <p className="text-gray-600 dark:text-gray-400" aria-busy="true">
        {t('common.loading')}
      </p>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <a href="#/" className="text-sm text-blue-700 underline dark:text-blue-400">
          {t('scan.back')}
        </a>
        <h1 className="mt-2 text-2xl font-bold">{t('scan.resultTitle')}</h1>
        <p className="mt-1 break-all text-gray-700 dark:text-gray-300">{task.target}</p>
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge status={task.status} />
          <button
            type="button"
            onClick={load}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {t('scan.refresh')}
          </button>
        </div>
      </div>

      {task.issueCounts.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('report.totalIssues')}>
          {task.issueCounts.map((c) => (
            <li
              key={c.severity}
              className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-800"
            >
              {t(`severity.${c.severity}`)}: <strong>{c.count}</strong>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h2 className="text-lg font-semibold">{t('scan.issues')}</h2>
        {issues.length === 0 ? (
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('report.noIssues')}</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t('scan.issues')}</caption>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th scope="col" className="py-2 pr-4 font-semibold">{t('report.severity')}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t('report.wcagCriterion')}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t('report.selector')}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t('report.message')}</th>
                <th scope="col" className="py-2 font-semibold">{t('report.engine')}</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 align-top dark:border-gray-900">
                  <td className="py-2 pr-4 whitespace-nowrap">{t(`severity.${i.severity}`)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{i.wcag_ref ?? '—'}</td>
                  <td className="py-2 pr-4 break-all font-mono text-xs">{i.selector}</td>
                  <td className="py-2 pr-4">{i.message}</td>
                  <td className="py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{i.engine}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reports.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold">{t('scan.reports')}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {reports.map((r) => (
              <li key={r.id}>
                <a
                  href={reportDownloadUrl(r.id)}
                  download
                  className="inline-block rounded border border-gray-300 px-3 py-1 text-sm text-blue-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-900"
                >
                  {r.lang} · {r.format.toUpperCase()} · {t('scan.downloadReport')}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
