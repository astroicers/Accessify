import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type PortalUser } from '../lib/api.js';
import { useAuth } from '../store.js';

const INPUT = 'mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700';
const ACTION_BTN =
  'rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800';

// 角色徽章：admin 實心 / viewer 外框（顏色 + 樣式 + 文字三通道，WCAG 1.4.1）
function RoleBadge({ role }: { role: 'admin' | 'viewer' }) {
  const { t } = useTranslation();
  return role === 'admin' ? (
    <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100">
      {t('users.roleAdmin')}
    </span>
  ) : (
    <span className="inline-block rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">
      {t('users.roleViewer')}
    </span>
  );
}

// 帳號管理頁（T802 / FR-101/102/104 / ADR-006；UIUX_SPEC §2 /admin/users）。admin only。
// 一次性密碼僅顯示一次（不可再取回）：以 role="status" live region 播報、憑證卡呈現 + 手動複製 fallback。
export function Users() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  // 自己那列不顯示操作鈕（改密走變更密碼頁；權威守衛在後端 selfManage）
  const selfUsername = useAuth((s) => s.username);
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 建立表單
  const [username, setUsername] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');
  const [password, setPassword] = useState('');
  // 一次性密碼面板（建立/重設後顯示一次）
  const [otp, setOtp] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  function refresh() {
    api
      .listUsers()
      .then(setUsers)
      .catch((err) => setLoadError(err instanceof ApiError ? err.messageKey : 'error.unknown'));
  }

  useEffect(() => {
    if (role === 'admin') refresh();
  }, [role]);

  if (role !== 'admin') {
    return (
      <section>
        <h1 className="text-2xl font-bold">{t('users.title')}</h1>
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {t('error.forbidden')}
        </p>
      </section>
    );
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setPending(true);
    try {
      await action();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    } finally {
      setPending(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setOtp(null);
    setCopied(false);
    await run(async () => {
      const r = await api.createUser({
        username: username.trim(),
        role: newRole,
        ...(password ? { password } : {}),
      });
      if (r.generatedPassword) setOtp({ username: r.username, password: r.generatedPassword });
      setUsername('');
      setPassword('');
      setNewRole('viewer');
    });
  }

  async function onResetPassword(u: PortalUser) {
    if (!window.confirm(t('users.resetConfirm'))) return;
    setOtp(null);
    setCopied(false);
    await run(async () => {
      const r = await api.resetUserPassword(u.id);
      setOtp({ username: u.username, password: r.generatedPassword });
    });
  }

  async function onToggleStatus(u: PortalUser) {
    if (u.status === 'active' && !window.confirm(t('users.disableConfirm'))) return;
    await run(() => api.updateUser(u.id, { status: u.status === 'active' ? 'disabled' : 'active' }));
  }

  async function onToggleRole(u: PortalUser) {
    await run(() => api.updateUser(u.id, { role: u.role === 'admin' ? 'viewer' : 'admin' }));
  }

  async function copyOtp() {
    if (!otp) return;
    try {
      // Clipboard API 需 secure context（ADR-008 TLS 部署滿足）；失敗時仍可自 readonly input 手動複製
      await navigator.clipboard.writeText(otp.password);
      setCopied(true);
    } catch {
      otpRef.current?.focus();
      otpRef.current?.select();
    }
  }

  return (
    <section className="anim-fade-rise max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">{t('users.title')}</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">{t('users.subtitle')}</p>

      {/* 建帳卡片 */}
      <form
        onSubmit={onCreate}
        className="mt-6 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/40"
        noValidate
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
          {t('users.create')}
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="grow">
            <label htmlFor="new-username" className="block text-sm font-medium">
              {t('users.username')}
            </label>
            <input
              id="new-username"
              name="new-username"
              autoComplete="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="new-role" className="block text-sm font-medium">
              {t('users.role')}
            </label>
            <select
              id="new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
              className={INPUT}
            >
              <option value="viewer">{t('users.roleViewer')}</option>
              <option value="admin">{t('users.roleAdmin')}</option>
            </select>
          </div>
          <div className="grow">
            <label htmlFor="new-user-password" className="block text-sm font-medium">
              {t('users.passwordOptional')}
            </label>
            <input
              id="new-user-password"
              name="new-user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {t('users.create')}
          </button>
        </div>
      </form>

      {/* 持久 live region（WCAG 4.1.3）：錯誤常駐 DOM、僅切換文字 */}
      <p role="alert" className="mt-3 min-h-5 text-sm text-red-700 dark:text-red-400">
        {error ? t(error) : ''}
      </p>

      {/* 一次性密碼憑證卡：僅顯示一次，role=status 播報 */}
      <div role="status" className="min-h-5">
        {otp && (
          <div className="anim-otp-reveal mt-2 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-semibold">{t('users.createdFor', { username: otp.username })}</p>
            <p className="mt-1 text-xs">{t('users.oneTimePassword')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="otp-value" className="sr-only">
                {t('users.oneTimePassword')}
              </label>
              <input
                id="otp-value"
                ref={otpRef}
                readOnly
                value={otp.password}
                onFocus={(e) => e.target.select()}
                className="w-64 rounded-md border border-amber-400 bg-white/70 px-3 py-2 font-mono text-base tracking-widest dark:border-amber-600 dark:bg-black/20"
              />
              <button
                type="button"
                onClick={copyOtp}
                className="rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {copied ? t('users.copied') : t('users.copy')}
              </button>
            </div>
          </div>
        )}
      </div>

      {loadError && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
          {t(loadError)}
        </p>
      )}
      {!users && !loadError && (
        <p className="mt-4 text-gray-600 dark:text-gray-400" aria-busy="true">
          {t('common.loading')}
        </p>
      )}

      {users && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t('users.title')}</caption>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('users.username')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('users.role')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('users.status')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('users.created')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/70 dark:border-gray-900 dark:hover:bg-gray-900/50"
                >
                  <td className="break-all px-3 py-2.5 font-medium">
                    {u.username}
                    {u.username === selfUsername && (
                      <span className="ml-1 font-normal text-gray-600 dark:text-gray-400">{t('users.self')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={u.status === 'active' ? '' : 'text-gray-500 dark:text-gray-400'}>
                      <span aria-hidden="true" className="mr-1">
                        {u.status === 'active' ? '●' : '○'}
                      </span>
                      {u.status === 'active' ? t('users.active') : t('users.disabled')}
                    </span>
                    {u.locked && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">
                        {t('users.locked')}
                      </span>
                    )}
                    {u.must_change_password === 1 && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {t('users.mustChange')}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600 dark:text-gray-400">{u.created_at}</td>
                  <td className="px-3 py-2.5">
                    {u.username !== selfUsername && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={pending} onClick={() => onToggleRole(u)} className={ACTION_BTN}>
                          {u.role === 'admin' ? t('users.makeViewer') : t('users.makeAdmin')}
                        </button>
                        <button type="button" disabled={pending} onClick={() => onToggleStatus(u)} className={ACTION_BTN}>
                          {u.status === 'active' ? t('users.disable') : t('users.enable')}
                        </button>
                        <button type="button" disabled={pending} onClick={() => onResetPassword(u)} className={ACTION_BTN}>
                          {t('users.resetPassword')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
