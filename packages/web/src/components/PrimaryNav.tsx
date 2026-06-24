import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { useAuth } from '../store.js';
import { navigate } from '../router.js';

export function PrimaryNav() {
  const { t } = useTranslation();
  const role = useAuth((s) => s.role);
  const clear = useAuth((s) => s.clear);

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
      <a href="#/" className="text-sm hover:underline">
        {t('nav.dashboard')}
      </a>
      {role === 'admin' && (
        <a href="#/scans/new" className="text-sm hover:underline">
          {t('nav.newScan')}
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
