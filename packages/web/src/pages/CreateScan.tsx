import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api.js';
import { navigate } from '../router.js';

export function CreateScan() {
  const { t } = useTranslation();
  const [target, setTarget] = useState('');
  const [type, setType] = useState<'url' | 'sitemap'>('url');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await api.createScan(target, type);
      navigate(`/scans/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold">{t('scan.create')}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="target" className="block text-sm font-medium">
            {t('scan.target')}
          </label>
          <input
            id="target"
            name="target"
            type="url"
            inputMode="url"
            required
            aria-describedby="target-hint"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          />
          <p id="target-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {t('scan.targetHint')}
          </p>
        </div>
        <div>
          <label htmlFor="type" className="block text-sm font-medium">
            {t('scan.type')}
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as 'url' | 'sitemap')}
            className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          >
            <option value="url">{t('scan.url')}</option>
            <option value="sitemap">{t('scan.sitemap')}</option>
          </select>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t(error)}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {pending ? t('common.loading') : t('scan.submit')}
          </button>
          <a href="#/" className="text-sm text-blue-700 underline hover:no-underline dark:text-blue-400">
            {t('scan.back')}
          </a>
        </div>
      </form>
    </section>
  );
}
