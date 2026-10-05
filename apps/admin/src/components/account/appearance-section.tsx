'use client';

import { FieldGroup, RadioGroup } from '@atrium/ui';
import { useTheme, type ThemePreference } from '@/lib/theme';

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section id="appearance" className="scroll-mt-6">
      <FieldGroup title="Appearance" description="Saved in this browser only.">
        <RadioGroup
          variant="cards"
          aria-label="Theme"
          className="sm:grid-cols-3"
          value={theme}
          onValueChange={(v) => setTheme(v as ThemePreference)}
          options={[
            { value: 'light', label: 'Light', description: 'Always use the light theme' },
            { value: 'dark', label: 'Dark', description: 'Always use the dark theme' },
            { value: 'system', label: 'System', description: 'Match your device setting' },
          ]}
        />
      </FieldGroup>
    </section>
  );
}
