'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'atrium.theme';

interface ThemeValue {
  theme: ThemePreference;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Inline script (runs before paint) that applies the stored theme to <html>. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY) as ThemePreference | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') setThemeState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const apply = () => {
      const r = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = r;
      setResolved(r);
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
