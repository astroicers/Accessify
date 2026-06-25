import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type Schedule } from '../lib/api.js';
import { useAuth } from '../store.js';

const INTERVALS: { key: string; seconds: number }[] = [
  { key: 'intervalHourly', seconds: 3600 },
  { key: 'intervalDaily', seconds: 86400 },
  { key: 'intervalWeekly', seconds: 604800 },
];

export function Schedules() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [type, setType] = useState<'url' | 'sitemap'>('url');
  const [interval, setInterval] = useState(86400);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    setListError(null);
    api
      .listSchedules()
      .then(setSchedules)
      .catch((err) => setListError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
  }, []);
  useEffect(() => {
    if (role === 'admin') load();
  }, [role, load]);

  if (role !== 'admin') {
    return (
      <section>
        <h1 className="text-2xl font-bold">{t('schedule.listTitle')}</h1>
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {t('error.forbidden')}
        </p>
      </section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      await api.createSchedule({ target, type, interval_seconds: interval });
      setTarget('');
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    } finally {
      setPending(false);
    }
  }

  async function toggle(s: Schedule) {
    try {
      await api.updateSchedule(s.id, { enabled: !s.enabled });
      load();
    } catch (err) {
      setListError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    }
  }
  async function remove(s: Schedule) {
    if (!window.confirm(`${t('schedule.remove')} ${s.target}?`)) return;
    try {
      await api.deleteSchedule(s.id);
      load();
    } catch (err) {
      setListError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    }
  }
  const intervalLabel = (secs: number) => {
    const m = INTERVALS.find((i) => i.seconds === secs);
    return m ? t(`schedule.${m.key}`) : `${secs} ${t('status.seconds')}`;
  };

  return (
    <section className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('schedule.listTitle')}</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">{t('schedule.subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <h2 className="text-lg font-semibold">{t('schedule.create')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="s-target" className="block text-sm font-medium">
              {t('scan.target')}
            </label>
            <input
              id="s-target"
              name="target"
              type="url"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
            />
          </div>
          <div>
            <label htmlFor="s-type" className="block text-sm font-medium">
              {t('scan.type')}
            </label>
            <select
              id="s-type"
              value={type}
              onChange={(e) => setType(e.target.value as 'url' | 'sitemap')}
              className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
            >
              <option value="url">{t('scan.url')}</option>
              <option value="sitemap">{t('scan.sitemap')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="s-interval" className="block text-sm font-medium">
              {t('schedule.interval')}
            </label>
            <select
              id="s-interval"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
            >
              {INTERVALS.map((i) => (
                <option key={i.key} value={i.seconds}>
                  {t(`schedule.${i.key}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t(formError)}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >
          {pending ? t('common.loading') : t('schedule.add')}
        </button>
      </form>

      <div>
        {listError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t(listError)}
          </p>
        )}
        {!schedules && !listError && (
          <p className="text-gray-600 dark:text-gray-400" aria-busy="true">
            {t('common.loading')}
          </p>
        )}
        {schedules && schedules.length === 0 && (
          <p className="text-gray-600 dark:text-gray-400">{t('schedule.noSchedules')}</p>
        )}
        {schedules && schedules.length > 0 && (
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t('schedule.listTitle')}</caption>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th scope="col" className="py-2 pr-4 font-semibold">{t('scan.target')}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t('schedule.interval')}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t('schedule.enabled')}</th>
                <th scope="col" className="py-2 pr-4 font-semibold">{t('schedule.nextRun')}</th>
                <th scope="col" className="py-2 font-semibold">{t('scan.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 dark:border-gray-900">
                  <td className="py-2 pr-4 break-all">{s.target}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{intervalLabel(s.interval_seconds)}</td>
                  <td className="py-2 pr-4">{s.enabled ? t('schedule.enabled') : '—'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-600 dark:text-gray-400">
                    {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : t('status.never')}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggle(s)}
                      className="mr-3 text-blue-700 underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-blue-400"
                    >
                      {s.enabled ? t('schedule.disable') : t('schedule.enable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      className="text-red-700 underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-red-400"
                    >
                      {t('schedule.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
