import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { useAuth } from '../store.js';
import { navigate, useRoute } from '../router.js';

export function PrimaryNav() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  const clear = useAuth((s) => s.clear);
  const route = useRoute();
  const current = (path: string) => (route === path ? 'page' : undefined);

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
      <a href="#/" aria-current={current('/')} className="text-sm hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline">
        {t('nav.dashboard')}
      </a>
      {role === 'admin' && (
        <a href="#/scans/new" aria-current={current('/scans/new')} className="text-sm hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline">
          {t('nav.newScan')}
        </a>
      )}
      <a href="#/status" aria-current={current('/status')} className="text-sm hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline">
        {t('nav.status')}
      </a>
      {role === 'admin' && (
        <a href="#/settings" aria-current={current('/settings')} className="text-sm hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline">
          {t('nav.settings')}
        </a>
      )}
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
