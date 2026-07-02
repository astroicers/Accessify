import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../store.js';
import { navigate } from '../router.js';

const INPUT = 'mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700';

// 變更密碼頁（T801 / FR-101 / ADR-006）：
// 一般模式由導覽進入；forced 模式由 App.tsx 的 mustChange gate 專屬渲染（首次登入/密碼被重設）。
export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { t } = useTranslation();
  const clearMustChange = useAuth((s) => s.clearMustChange);
  const clear = useAuth((s) => s.clear);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    // 前端預檢僅為即時回饋；權威政策檢查在伺服器端
    if (next !== confirm) {
      setError('error.passwordMismatch');
      return;
    }
    if (next.length < 12) {
      setError('error.passwordPolicy');
      return;
    }
    setPending(true);
    try {
      await api.changePassword(current, next);
      if (forced) {
        clearMustChange();
        navigate('/');
      } else {
        setDone(true);
        setCurrent('');
        setNext('');
        setConfirm('');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // 即使後端登出失敗也清除本地 session
    }
    clear();
    navigate('/');
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold">{t('password.title')}</h1>
      {forced && <p className="mt-1 text-gray-600 dark:text-gray-400">{t('password.forcedIntro')}</p>}

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="current-password" className="block text-sm font-medium">
            {t('password.current')}
          </label>
          <input
            id="current-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium">
            {t('password.new')}
          </label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            aria-describedby="new-password-hint"
            aria-invalid={error ? true : undefined}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={INPUT}
          />
          <p id="new-password-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            {t('password.hint')}
          </p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium">
            {t('password.confirm')}
          </label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT}
          />
        </div>

        {/* 持久 live region：錯誤/成功皆常駐 DOM、僅切換文字，確保螢幕報讀者播報（WCAG 4.1.3）。 */}
        <p role="alert" className="min-h-5 text-sm text-red-700 dark:text-red-400">
          {error ? t(error) : ''}
        </p>
        <p role="status" className="min-h-5 text-sm text-green-700 dark:text-green-400">
          {done ? t('password.changed') : ''}
        </p>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {pending ? t('common.loading') : t('password.submit')}
          </button>
          {forced && (
            <button
              type="button"
              onClick={logout}
              className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              {t('nav.logout')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
