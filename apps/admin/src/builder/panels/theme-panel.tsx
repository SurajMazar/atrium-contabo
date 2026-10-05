'use client';

import { jsonClone } from '@atrium/builder-core';
import { THEME_PRESETS } from '@atrium/design-tokens';
import type { FontDefinition, ThemeTokens } from '@atrium/schema';
import { Check, Lock } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CURATED_FONTS, fontPreviewUrl } from '../lib/fonts';
import { cn } from '../lib/cn';
import { humanize } from '../lib/controls';
import { mutate, useDocumentStore } from '../store/document';
import { usePerms } from '../store/editor';
import { CommitInput, Group, NativeSelect, NumberInput, PanelHeader, Popover, PopoverContent, PopoverTrigger, RangeSlider, Row, SearchInput, Segmented } from '../ui/primitives';

const COLOR_ORDER = ['primary', 'primaryContrast', 'secondary', 'accent', 'background', 'surface', 'surfaceAlt', 'text', 'muted', 'border', 'inverse', 'inverseText', 'success', 'warning', 'danger'];

function editTheme(label: string, recipe: (t: ThemeTokens) => void, mergeKey?: string) {
  mutate(label, (d) => recipe(d.theme), { mergeKey: mergeKey ? `theme:${mergeKey}` : undefined });
}

/** Load preview CSS for the curated fonts once (admin document only). */
function useFontPreviews() {
  useEffect(() => {
    const id = 'atrium-font-previews';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = fontPreviewUrl(CURATED_FONTS.map((f) => f.family));
    document.head.appendChild(link);
  }, []);
}

export function ThemePanel() {
  const theme = useDocumentStore((s) => s.definition?.theme);
  const perms = usePerms();
  useFontPreviews();
  if (!theme) return null;
  const ro = !perms.theme;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Theme" actions={ro ? <span title="You do not have permission to edit the theme"><Lock className="size-3.5 text-fg-subtle" /></span> : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ro && <p className="border-b border-border bg-surface-2 px-3 py-2 text-[11px] text-fg-muted">View only — editing the theme requires the “Edit theme” permission.</p>}
        <fieldset disabled={ro} className="contents">
          <Group id="theme-presets" title="Presets">
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(THEME_PRESETS).map(([key, p]) => {
                const active = theme.name === p.name;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={ro}
                    onClick={() => editTheme(`Apply theme “${p.name}”`, (t) => Object.assign(t, jsonClone(p)))}
                    className={cn('overflow-hidden rounded-md border text-left disabled:opacity-60', active ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-border-strong')}
                  >
                    <div className="flex h-10" style={{ background: p.colors.background }}>
                      {[p.colors.primary, p.colors.secondary, p.colors.accent, p.colors.surface].map((c, i) => (
                        <span key={i} className="flex-1" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="flex items-center gap-1 px-1.5 py-1">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium" style={{ fontFamily: `"${p.typography.heading.family}", serif` }}>
                        {p.name}
                      </span>
                      {active && <Check className="size-3 text-accent" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </Group>

          <Group id="theme-colors" title="Colors">
            <Row label="Scheme">
              <Segmented value={theme.colorScheme} onChange={(v) => editTheme('Color scheme', (t) => void (t.colorScheme = v))} options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]} />
            </Row>
            {COLOR_ORDER.filter((k) => k in theme.colors).map((k) => (
              <Row key={k} label={humanize(k)}>
                <ColorHex value={(theme.colors as Record<string, string>)[k]!} onChange={(v, live) => editTheme(`Theme color: ${humanize(k)}`, (t) => void ((t.colors as Record<string, string>)[k] = v), live ? `color:${k}` : undefined)} />
              </Row>
            ))}
          </Group>

          <Group id="theme-type" title="Typography">
            <Row label="Headings" stacked>
              <FontPicker font={theme.typography.heading} onChange={(f) => f && editTheme('Heading font', (t) => void (t.typography.heading = f))} />
            </Row>
            <Row label="Body" stacked>
              <FontPicker font={theme.typography.body} onChange={(f) => f && editTheme('Body font', (t) => void (t.typography.body = f))} />
            </Row>
            <Row label="Accent" stacked>
              <FontPicker font={theme.typography.accent} optional onChange={(f) => editTheme('Accent font', (t) => (f ? void (t.typography.accent = f) : void delete t.typography.accent))} />
            </Row>
            <Row label="Base size">
              <SliderRow value={theme.typography.baseSize} min={12} max={22} step={1} unit="px" onChange={(v, live) => editTheme('Base font size', (t) => void (t.typography.baseSize = v), live ? 'base' : undefined)} />
            </Row>
            <Row label="Type scale">
              <NativeSelect
                value={String(theme.typography.scale)}
                onChange={(v) => editTheme('Type scale', (t) => void (t.typography.scale = Number(v)))}
                options={[
                  { label: 'Minor second · 1.067', value: '1.067' }, { label: 'Major second · 1.125', value: '1.125' }, { label: 'Minor third · 1.2', value: '1.2' },
                  { label: 'Major third · 1.25', value: '1.25' }, { label: 'Perfect fourth · 1.333', value: '1.333' }, { label: 'Aug. fourth · 1.414', value: '1.414' },
                  { label: 'Perfect fifth · 1.5', value: '1.5' }, { label: 'Golden · 1.618', value: '1.618' },
                  ...(![1.067, 1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618].includes(theme.typography.scale) ? [{ label: `Custom · ${theme.typography.scale}`, value: String(theme.typography.scale) }] : []),
                ]}
              />
            </Row>
            <Row label="Heading weight">
              <NativeSelect value={String(theme.typography.headingWeight)} onChange={(v) => editTheme('Heading weight', (t) => void (t.typography.headingWeight = Number(v)))} options={[300, 400, 500, 600, 700, 800].map((w) => ({ label: String(w), value: String(w) }))} />
            </Row>
            <Row label="Heading tracking">
              <CommitInput mono value={theme.typography.headingLetterSpacing} onCommit={(v) => editTheme('Heading letter spacing', (t) => void (t.typography.headingLetterSpacing = v || '0'))} />
            </Row>
            <Row label="Heading case">
              <Segmented value={theme.typography.headingTransform} onChange={(v) => editTheme('Heading case', (t) => void (t.typography.headingTransform = v))} options={[{ label: 'Normal', value: 'none' }, { label: 'UPPER', value: 'uppercase' }]} />
            </Row>
            <Row label="Line height">
              <SliderRow value={theme.typography.bodyLineHeight} min={1.2} max={2} step={0.05} onChange={(v, live) => editTheme('Body line height', (t) => void (t.typography.bodyLineHeight = v), live ? 'lh' : undefined)} />
            </Row>
          </Group>

          <Group id="theme-shape" title="Shape & spacing">
            <Row label="Corner radius">
              <Segmented
                value={radiusPreset(theme)}
                onChange={(v) => editTheme('Corner radius', (t) => Object.assign(t.radius, RADIUS_PRESETS[v as keyof typeof RADIUS_PRESETS]))}
                options={[{ label: 'Square', value: 'square' }, { label: 'Soft', value: 'soft' }, { label: 'Round', value: 'round' }, { label: 'Pill', value: 'pill' }]}
              />
            </Row>
            <Row label="Section spacing">
              <Segmented value={theme.spacing.sectionY} onChange={(v) => editTheme('Section spacing', (t) => void (t.spacing.sectionY = v))} options={[{ label: 'Compact', value: 'compact' }, { label: 'Regular', value: 'regular' }, { label: 'Airy', value: 'airy' }]} />
            </Row>
            <Row label="Spacing unit">
              <NumberInput value={theme.spacing.unit} min={2} max={8} unit="px" onCommit={(v) => v && editTheme('Spacing unit', (t) => void (t.spacing.unit = v))} />
            </Row>
            {(['narrow', 'default', 'wide'] as const).map((k) => (
              <Row key={k} label={`Container ${k}`}>
                <CommitInput mono value={theme.containerWidths[k]} onCommit={(v) => v && editTheme('Container width', (t) => void (t.containerWidths[k] = v))} />
              </Row>
            ))}
          </Group>

          <Group id="theme-buttons" title="Buttons">
            <Row label="Corners">
              <Segmented
                value={theme.buttons.radius === '0' || theme.buttons.radius === '0px' ? 'square' : theme.buttons.radius === '9999px' ? 'pill' : theme.buttons.radius ? 'custom' : 'theme'}
                onChange={(v) => editTheme('Button corners', (t) => void (t.buttons.radius = v === 'square' ? '0' : v === 'pill' ? '9999px' : v === 'theme' ? undefined : t.buttons.radius ?? '6px'))}
                options={[{ label: 'Theme', value: 'theme' }, { label: 'Square', value: 'square' }, { label: 'Pill', value: 'pill' }, { label: 'Custom', value: 'custom' }]}
              />
            </Row>
            <Row label="Case">
              <Segmented value={theme.buttons.textTransform} onChange={(v) => editTheme('Button case', (t) => void (t.buttons.textTransform = v))} options={[{ label: 'Normal', value: 'none' }, { label: 'UPPER', value: 'uppercase' }]} />
            </Row>
            <Row label="Tracking">
              <CommitInput mono value={theme.buttons.letterSpacing} onCommit={(v) => editTheme('Button letter spacing', (t) => void (t.buttons.letterSpacing = v || '0'))} />
            </Row>
            <Row label="Padding">
              <div className="flex gap-1">
                <CommitInput mono value={theme.buttons.paddingY} onCommit={(v) => editTheme('Button padding', (t) => void (t.buttons.paddingY = v || '0.85em'))} />
                <CommitInput mono value={theme.buttons.paddingX} onCommit={(v) => editTheme('Button padding', (t) => void (t.buttons.paddingX = v || '1.6em'))} />
              </div>
            </Row>
            <Row label="Weight">
              <NativeSelect value={String(theme.buttons.weight)} onChange={(v) => editTheme('Button weight', (t) => void (t.buttons.weight = Number(v)))} options={[400, 500, 600, 700].map((w) => ({ label: String(w), value: String(w) }))} />
            </Row>
          </Group>

          <Group id="theme-motion" title="Motion">
            <Row label="Intensity">
              <Segmented value={theme.motion.intensity} onChange={(v) => editTheme('Motion intensity', (t) => void (t.motion.intensity = v))} options={[{ label: 'Off', value: 'none' }, { label: 'Subtle', value: 'subtle' }, { label: 'Moderate', value: 'moderate' }, { label: 'Bold', value: 'expressive' }]} />
            </Row>
            <Row label="Duration">
              <SliderRow value={theme.motion.duration} min={0.3} max={2} step={0.05} unit="s" onChange={(v, live) => editTheme('Motion duration', (t) => void (t.motion.duration = v), live ? 'dur' : undefined)} />
            </Row>
            <Row label="Easing">
              <NativeSelect value={theme.motion.ease} onChange={(v) => editTheme('Motion easing', (t) => void (t.motion.ease = v))} options={['power2.out', 'power3.out', 'power4.out', 'expo.out', 'sine.out', 'power4.inOut'].map((e) => ({ label: e, value: e }))} />
            </Row>
          </Group>
        </fieldset>
      </div>
    </div>
  );
}

const RADIUS_PRESETS = {
  square: { sm: '0', md: '0', lg: '0', xl: '0' },
  soft: { sm: '2px', md: '4px', lg: '8px', xl: '14px' },
  round: { sm: '6px', md: '10px', lg: '16px', xl: '24px' },
  pill: { sm: '9999px', md: '9999px', lg: '24px', xl: '32px' },
};
function radiusPreset(t: ThemeTokens) {
  for (const [k, v] of Object.entries(RADIUS_PRESETS)) if (v.md === t.radius.md && v.lg === t.radius.lg) return k;
  return 'soft';
}

function SliderRow({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number, live?: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <RangeSlider value={value} min={min} max={max} step={step} onChange={(v) => onChange(v, true)} />
      <NumberInput className="w-16 shrink-0" value={value} min={min} max={max} step={step} unit={unit} onCommit={(v) => v !== undefined && onChange(v)} />
    </div>
  );
}

function ColorHex({ value, onChange }: { value: string; onChange: (v: string, live?: boolean) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value, true)} className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5" aria-label="Pick color" />
      <CommitInput mono value={value} onCommit={(v) => v && onChange(v)} />
    </div>
  );
}

/** Searchable curated Google Fonts picker with weight selection. */
function FontPicker({ font, onChange, optional }: { font: FontDefinition | undefined; onChange: (f: FontDefinition | undefined) => void; optional?: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.toLowerCase());
  const list = useMemo(() => CURATED_FONTS.filter((f) => !dq || f.family.toLowerCase().includes(dq) || f.category.includes(dq)), [dq]);
  const curated = CURATED_FONTS.find((f) => f.family === font?.family);
  return (
    <div className="space-y-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-left hover:border-border-strong">
            <span className="min-w-0 flex-1 truncate text-[14px]" style={{ fontFamily: font ? `"${font.family}", ${font.fallback}` : undefined }}>
              {font?.family ?? (optional ? 'Same as headings' : 'Choose font')}
            </span>
            <span className="text-[11px] text-fg-subtle">{curated?.category ?? font?.source}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search fonts or serif / sans…" autoFocus />
          <div className="mt-2 max-h-72 overflow-y-auto">
            {optional && (
              <button type="button" onClick={() => onChange(undefined)} className="flex w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-surface-2">
                Same as headings
              </button>
            )}
            {list.map((f) => (
              <button
                key={f.family}
                type="button"
                onClick={() => onChange({ family: f.family, source: 'google', weights: f.weights.filter((w) => [400, 500, 600, 700].includes(w)).slice(0, 4).length ? f.weights.filter((w) => [400, 500, 600, 700].includes(w)) : f.weights, italic: font?.italic ?? false, fallback: f.fallback })}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2', f.family === font?.family && 'bg-accent-soft')}
              >
                <span className="min-w-0 flex-1 truncate text-[15px]" style={{ fontFamily: `"${f.family}", ${f.fallback}` }}>
                  {f.family}
                </span>
                <span className="text-[10px] text-fg-subtle">{f.category}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {font && curated && (
        <div className="flex flex-wrap gap-1">
          {curated.weights.map((w) => {
            const on = font.weights.includes(w);
            return (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const weights = on ? font.weights.filter((x) => x !== w) : [...font.weights, w].sort((a, b) => a - b);
                  if (weights.length) onChange({ ...font, weights });
                }}
                className={cn('h-5 rounded border px-1.5 font-mono text-[10px]', on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-fg-subtle hover:bg-surface-2')}
              >
                {w}
              </button>
            );
          })}
          <button type="button" onClick={() => onChange({ ...font, italic: !font.italic })} className={cn('h-5 rounded border px-1.5 text-[10px] italic', font.italic ? 'border-accent bg-accent-soft text-accent' : 'border-border text-fg-subtle')}>
            italic
          </button>
        </div>
      )}
    </div>
  );
}
