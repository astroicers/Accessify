import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../store.js';
import { navigate } from '../router.js';

export function Login() {
  const { t } = useTranslation();
  const setAuth = useAuth((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await api.login(username, password);
      setAuth(r.token, r.role, r.mustChangePassword);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.unknown');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold">{t('login.title')}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="username" className="block text-sm font-medium">
            {t('login.username')}
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {t('login.password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t(error)}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        >
          {pending ? t('common.loading') : t('login.submit')}
        </button>
      </form>
    </section>
  );
}
