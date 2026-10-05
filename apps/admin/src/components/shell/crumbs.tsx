'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

export interface ShellCrumb {
  label: string;
  href?: string;
}

interface ShellState {
  /** Extra crumbs appended after the route-derived ones (e.g. a form name). */
  extra: ShellCrumb[];
  setExtra: (c: ShellCrumb[]) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
}

export const useShell = create<ShellState>((set) => ({
  extra: [],
  setExtra: (extra) => set({ extra }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));

/** Declaratively append breadcrumbs for detail screens: `<SetCrumbs items={[{ label: form.name }]} />`. */
export function SetCrumbs({ items }: { items: ShellCrumb[] }) {
  const setExtra = useShell((s) => s.setExtra);
  const key = JSON.stringify(items);
  useEffect(() => {
    setExtra(JSON.parse(key) as ShellCrumb[]);
    return () => setExtra([]);
  }, [key, setExtra]);
  return null;
}
