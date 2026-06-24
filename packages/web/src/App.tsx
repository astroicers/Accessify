import { ThemeProvider } from 'next-themes';
import { useTranslation } from 'react-i18next';
import './i18n.js';
import { Layout } from './components/Layout.js';
import { PrimaryNav } from './components/PrimaryNav.js';
import { Dashboard } from './pages/Dashboard.js';
import { CreateScan } from './pages/CreateScan.js';
import { ScanResult } from './pages/ScanResult.js';
import { Login } from './pages/Login.js';
import { useAuth } from './store.js';
import { useRoute } from './router.js';

function renderRoute(route: string) {
  if (route === '/scans/new') return <CreateScan />;
  const m = /^\/scans\/(\d+)$/.exec(route);
  if (m) return <ScanResult id={Number(m[1])} />;
  return <Dashboard />;
}

function MustChangeBanner() {
  const { t } = useTranslation();
  const mustChange = useAuth((s) => s.mustChange);
  const dismiss = useAuth((s) => s.clearMustChange);
  if (!mustChange) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <span>{t('login.mustChange')}</span>
      <button type="button" onClick={dismiss} className="ml-3 underline">
        {t('common.cancel')}
      </button>
    </div>
  );
}

function Root() {
  const token = useAuth((s) => s.token);
  const route = useRoute();

  if (!token) {
    return (
      <Layout>
        <Login />
      </Layout>
    );
  }

  return (
    <Layout nav={<PrimaryNav />}>
      <MustChangeBanner />
      {renderRoute(route)}
    </Layout>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <Root />
    </ThemeProvider>
  );
}
