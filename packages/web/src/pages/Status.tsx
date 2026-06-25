import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type ServerStatus } from '../lib/api.js';

const OVERALL_STYLE: Record<string, string> = {
  healthy: 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100',
  degraded: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  down: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-1.5 dark:border-gray-900">
      <dt className="text-gray-600 dark:text-gray-400">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export function Status() {
  const { t } = useTranslation();
  const [s, setS] = useState<ServerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // 每次成功載入遞增 → 觸發持久 live region 播報

  const load = useCallback(() => {
    setError(null);
    api
      .getStatus()
      .then((d) => {
        setS(d);
        setTick((n) => n + 1);
      })
      .catch((err) => setError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
  }, []);
  useEffect(load, [load]);

  const secs = (n: number | null) => (n == null ? t('status.never') : `${n} ${t('status.seconds')}`);

  return (
    <section className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('status.title')}</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">{t('status.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {t('scan.refresh')}
        </button>
      </div>

      {/* 持久 polite live region：成功重整時播報（WCAG 4.1.3 狀態訊息）。 */}
      <p role="status" className="sr-only">
        {tick > 0 ? t('status.updated') : ''}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(error)}
        </p>
      )}

      {!s && !error && (
        <p className="text-gray-600 dark:text-gray-400" aria-busy="true">
          {t('common.loading')}
        </p>
      )}

      {s && (
        <>
          <dl className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <dt className="text-gray-600 dark:text-gray-400">{t('status.overall')}</dt>
            <dd>
              <span className={`rounded px-2 py-0.5 text-sm font-semibold ${OVERALL_STYLE[s.overall]}`}>
                {t(`status.${s.overall}`)}
              </span>
            </dd>
            <dt className="ml-2 text-gray-600 dark:text-gray-400">{t('status.uptime')}</dt>
            <dd className="text-sm text-gray-600 dark:text-gray-400">{secs(s.uptimeSec)}</dd>
          </dl>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="mb-1 text-lg font-semibold">{t('status.queueTitle')}</h2>
              <dl>
                <Row label={t('scan.queued')}>{s.queue.queued}</Row>
                <Row label={t('scan.running')}>{s.queue.running}</Row>
                <Row label={t('scan.completed')}>{s.queue.completed}</Row>
                <Row label={t('scan.failed')}>{s.queue.failed}</Row>
                <Row label={t('status.oldestQueued')}>{secs(s.queue.oldestQueuedAgeSec)}</Row>
              </dl>
            </div>

            <div>
              <h2 className="mb-1 text-lg font-semibold">{t('status.workerTitle')}</h2>
              <dl>
                <Row label={t('status.heartbeat')}>{secs(s.worker.heartbeatStaleSec)}</Row>
                <Row label={t('status.staleLeases')}>{s.worker.staleLeases}</Row>
              </dl>
            </div>

            <div>
              <h2 className="mb-1 text-lg font-semibold">{t('status.dbTitle')}</h2>
              <dl>
                <Row label={t('status.integrity')}>
                  {s.db.integrity === 'ok' ? t('status.ok') : t('status.fail')}
                </Row>
                <Row label={t('status.schemaVersion')}>{s.db.schemaVersion}</Row>
              </dl>
            </div>

            <div>
              <h2 className="mb-1 text-lg font-semibold">{t('status.diskTitle')}</h2>
              <dl>
                {s.disk ? (
                  <>
                    <Row label={t('status.diskUsage')}>{`${s.disk.usedPct}%`}</Row>
                    <Row label={t('status.diskFree')}>
                      {(s.disk.freeBytes / 1e9).toFixed(1)} {t('status.gb')}
                    </Row>
                  </>
                ) : (
                  <Row label={t('status.diskUsage')}>{t('status.never')}</Row>
                )}
              </dl>
            </div>

            <div className="sm:col-span-2">
              <h2 className="mb-1 text-lg font-semibold">{t('status.versionsTitle')}</h2>
              <dl>
                <Row label={t('status.app')}>{s.versions.app}</Row>
                <Row label={t('status.node')}>{s.versions.node}</Row>
                <Row label={t('status.schemaVersion')}>{s.versions.schema}</Row>
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
