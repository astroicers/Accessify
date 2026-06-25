import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../store.js';

// 設定頁（T505 / FR-601）：目前唯一被消費的設定是 scan_whitelist（出站白名單）。
// 不放入無 reader 的假設定（穩定優先 / 不過度設計）；admin only。
export function Settings() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  const [whitelist, setWhitelist] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (role !== 'admin') return;
    let alive = true;
    api
      .getSettings()
      .then((s) => {
        if (!alive) return;
        const hosts = (s.scan_whitelist ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        setWhitelist(hosts.join('\n'));
      })
      .catch((err) => alive && setLoadError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
    return () => {
      alive = false;
    };
  }, [role]);

  if (role !== 'admin') {
    return (
      <section>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {t('error.forbidden')}
        </p>
      </section>
    );
  }

  // 載入完成前（含載入失敗）一律不渲染可編輯表單，避免在空白狀態下誤覆蓋既有白名單。
  if (whitelist === null) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">{t('settings.subtitle')}</p>
        {loadError ? (
          <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">
            {t(loadError)}
          </p>
        ) : (
          <p className="mt-6 text-gray-600 dark:text-gray-400" aria-busy="true">
            {t('common.loading')}
          </p>
        )}
      </section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const hosts = (whitelist ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    // 清空白名單會停用所有掃描 — 明確二次確認，避免靜默誤操作。
    if (hosts.length === 0 && !window.confirm(t('settings.emptyConfirm'))) return;
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await api.updateSettings({ scan_whitelist: hosts.join(',') });
      setWhitelist(hosts.join('\n'));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    } finally {
      setPending(false);
    }
  }

  const describedBy = error ? 'whitelist-hint whitelist-error' : 'whitelist-hint';

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">{t('settings.subtitle')}</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <h2 className="text-lg font-semibold">{t('settings.whitelistTitle')}</h2>
        <div>
          <label htmlFor="whitelist" className="block text-sm font-medium">
            {t('settings.whitelistLabel')}
          </label>
          <textarea
            id="whitelist"
            name="whitelist"
            rows={8}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            value={whitelist ?? ''}
            onChange={(e) => {
              setWhitelist(e.target.value);
              setSaved(false);
            }}
            className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-gray-700"
          />
          <p id="whitelist-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {t('settings.whitelistHint')}
          </p>
        </div>

        {/* 持久 live region：錯誤/成功皆常駐 DOM、僅切換文字，確保螢幕報讀者播報（WCAG 4.1.3）。 */}
        <p id="whitelist-error" role="alert" className="min-h-5 text-sm text-red-700 dark:text-red-400">
          {error ? t(error) : ''}
        </p>
        <p role="status" className="min-h-5 text-sm text-green-700 dark:text-green-400">
          {saved ? t('settings.saved') : ''}
        </p>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >
          {pending ? t('common.loading') : t('common.save')}
        </button>
      </form>
    </section>
  );
}
