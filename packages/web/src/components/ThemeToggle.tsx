import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="rounded border border-gray-300 px-2 py-1 text-sm"
      onClick={() => setTheme(next)}
      aria-label={t('common.toggleTheme')}
    >
      <span aria-hidden="true">{resolvedTheme === 'dark' ? '☾' : '☀'}</span>
    </button>
  );
}
