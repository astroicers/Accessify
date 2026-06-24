import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher.js';
import { ThemeToggle } from './ThemeToggle.js';

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <a href="#main" className="sr-only focus:not-sr-only">
        {t('common.skipToContent')}
      </a>
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <a href="/" className="text-lg font-semibold">
          {t('app.name')}
        </a>
        <nav aria-label="primary" className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl p-4">
        {children}
      </main>
    </div>
  );
}
