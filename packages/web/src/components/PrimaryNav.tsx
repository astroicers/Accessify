import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { useAuth, useNotify } from '../store.js';
import { navigate, useRoute } from '../router.js';

const LINK = 'text-sm hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline';

export function PrimaryNav() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  const clear = useAuth((s) => s.clear);
  const route = useRoute();
  const unread = useNotify((s) => s.unread);
  const refreshUnread = useNotify((s) => s.refresh);
  const current = (path: string) => (route === path ? 'page' : undefined);

  // 未讀計數：載入時取一次 + 每 60 秒輪詢（本地 API，無對外）。
  useEffect(() => {
    void refreshUnread();
    const id = window.setInterval(() => void refreshUnread(), 60_000);
    return () => window.clearInterval(id);
  }, [refreshUnread]);

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
    <>
      <a href="#/" aria-current={current('/')} className={LINK}>
        {t('nav.dashboard')}
      </a>
      {role === 'admin' && (
        <a href="#/scans/new" aria-current={current('/scans/new')} className={LINK}>
          {t('nav.newScan')}
        </a>
      )}
      {role === 'admin' && (
        <a href="#/schedules" aria-current={current('/schedules')} className={LINK}>
          {t('nav.schedules')}
        </a>
      )}
      <a
        href="#/notifications"
        aria-current={current('/notifications')}
        aria-label={unread > 0 ? `${t('nav.notifications')} (${unread} ${t('notifications.unread')})` : undefined}
        className={LINK}
      >
        {t('nav.notifications')}
        {unread > 0 && (
          <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{unread}</span>
        )}
      </a>
      <a href="#/status" aria-current={current('/status')} className={LINK}>
        {t('nav.status')}
      </a>
      {role === 'admin' && (
        <a href="#/settings" aria-current={current('/settings')} className={LINK}>
          {t('nav.settings')}
        </a>
      )}
      {role === 'admin' && (
        <a href="#/admin/users" aria-current={current('/admin/users')} className={LINK}>
          {t('nav.users')}
        </a>
      )}
      <a href="#/change-password" aria-current={current('/change-password')} className={LINK}>
        {t('nav.changePassword')}
      </a>
      <button
        type="button"
        onClick={logout}
        className="text-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t('nav.logout')}
      </button>
    </>
  );
}
