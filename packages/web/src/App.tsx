import { useEffect } from 'react';
import { ThemeProvider } from 'next-themes';
import './i18n.js';
import { Layout } from './components/Layout.js';
import { PrimaryNav } from './components/PrimaryNav.js';
import { Dashboard } from './pages/Dashboard.js';
import { CreateScan } from './pages/CreateScan.js';
import { ScanResult } from './pages/ScanResult.js';
import { Settings } from './pages/Settings.js';
import { Status } from './pages/Status.js';
import { Schedules } from './pages/Schedules.js';
import { Notifications } from './pages/Notifications.js';
import { Login } from './pages/Login.js';
import { ChangePassword } from './pages/ChangePassword.js';
import { Users } from './pages/Users.js';
import { useAuth } from './store.js';
import { useRoute } from './router.js';

function renderRoute(route: string) {
  if (route === '/scans/new') return <CreateScan />;
  if (route === '/schedules') return <Schedules />;
  if (route === '/notifications') return <Notifications />;
  if (route === '/settings') return <Settings />;
  if (route === '/status') return <Status />;
  if (route === '/change-password') return <ChangePassword />;
  if (route === '/admin/users') return <Users />;
  const m = /^\/scans\/(\d+)$/.exec(route);
  if (m) return <ScanResult id={Number(m[1])} />;
  return <Dashboard />;
}

function Root() {
  const token = useAuth((s) => s.token);
  const mustChange = useAuth((s) => s.mustChange);
  const route = useRoute();

  // 換頁時把焦點移到 <main>，避免鍵盤焦點孤立、並讓螢幕報讀者察覺頁面切換（WCAG 2.4.3）。
  useEffect(() => {
    document.getElementById('main')?.focus();
  }, [route, token, mustChange]);

  if (!token) {
    return (
      <Layout>
        <Login />
      </Layout>
    );
  }

  // 強制改密硬 gate（T801）：完成改密前不渲染導覽與其他頁面，僅留頁內登出逃生。
  if (mustChange) {
    return (
      <Layout>
        <ChangePassword forced />
      </Layout>
    );
  }

  return <Layout nav={<PrimaryNav />}>{renderRoute(route)}</Layout>;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <Root />
    </ThemeProvider>
  );
}
