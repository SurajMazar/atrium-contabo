'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BRANDING_CACHE_KEY, brandingInitScript } from './branding-core';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'atrium.theme';

interface ThemeValue {
  /** Effective preference: the user's saved choice, else the brand default. */
  theme: ThemePreference;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemePreference) => void;
  /** Brand default used while the user has no saved preference. */
  setDefaultTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Inline script (runs before paint): applies cached white-label branding and
 * the theme (saved preference → brand default → OS) to <html>.
 */
export const themeInitScript = brandingInitScript;

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored(): ThemePreference | null {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<ThemePreference | null>(null);
  const [fallback, setFallback] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');
  const [ready, setReady] = useState(false);
  const theme = stored ?? fallback;

  // Adopt what the pre-paint script decided before touching <html>, so the
  // first client render never flips the theme.
  useEffect(() => {
    setStored(readStored());
    try {
      const cached = JSON.parse(window.localStorage.getItem(BRANDING_CACHE_KEY) ?? 'null') as { theme?: ThemePreference } | null;
      if (cached?.theme) setFallback(cached.theme);
    } catch {
      /* ignore */
    }
    setResolved(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
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
  }, [theme, ready]);

  const setTheme = useCallback((t: ThemePreference) => {
    setStored(t);
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme, setDefaultTheme: setFallback }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
