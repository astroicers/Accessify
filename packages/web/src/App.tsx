import { ThemeProvider } from 'next-themes';
import './i18n.js';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <Layout>
        <Dashboard />
      </Layout>
    </ThemeProvider>
  );
}
