import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../store.js';
import { navigate } from '../router.js';

const INPUT = 'mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700';

// 變更密碼頁（T801 / FR-101 / ADR-006）：
// 一般模式由導覽進入；forced 模式由 App.tsx 的 mustChange gate 專屬渲染（首次登入/密碼被重設）。
// 政策條件以即時 checklist 呈現（雙通道：符號 + 文字，WCAG 1.4.1）；權威檢查仍在伺服器端。
export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { t } = useTranslation();
  const clearMustChange = useAuth((s) => s.clearMustChange);
  const clear = useAuth((s) => s.clear);
  const username = useAuth((s) => s.username);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  // 即時政策 checklist（視覺輔助；伺服器為權威）
  const rules: Array<{ key: string; ok: boolean }> = [
    { key: 'password.ruleLength', ok: next.length >= 12 && next.length <= 72 },
    {
      key: 'password.ruleDiffers',
      ok: next.length > 0 && next.toLowerCase() !== (username ?? '').toLowerCase() && next !== current,
    },
    { key: 'password.ruleMatch', ok: confirm.length > 0 && next === confirm },
  ];

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
    <section className="anim-fade-rise mx-auto mt-6 max-w-sm">
      {forced && (
        <div className="mb-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {t('password.forcedIntro')}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 dark:border-gray-800 dark:bg-gray-900/40">
        <h1 className="text-2xl font-bold tracking-tight">{t('password.title')}</h1>

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
              aria-describedby="password-rules"
              aria-invalid={error ? true : undefined}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={INPUT}
            />
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

          {/* 政策條件即時回饋：達成 ✓ 綠 / 未達成 ○ 灰（符號 + 顏色雙通道） */}
          <ul id="password-rules" className="space-y-1 text-xs">
            {rules.map((r) => (
              <li
                key={r.key}
                className={
                  r.ok
                    ? 'text-green-700 transition-colors dark:text-green-400'
                    : 'text-gray-600 transition-colors dark:text-gray-400'
                }
              >
                <span aria-hidden="true" className="mr-1.5 inline-block w-3 text-center">
                  {r.ok ? '✓' : '○'}
                </span>
                {t(r.key)}
              </li>
            ))}
          </ul>

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
              className="w-full rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              {pending ? t('common.loading') : t('password.submit')}
            </button>
            {forced && (
              <button
                type="button"
                onClick={logout}
                className="shrink-0 rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {t('nav.logout')}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
