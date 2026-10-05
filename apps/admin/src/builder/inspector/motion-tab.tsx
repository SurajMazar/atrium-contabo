'use client';

import { listAnimationPresets, PRESET_MAP } from '@atrium/animations';
import { registry } from '@atrium/component-registry';
import type { Animation, Node } from '@atrium/schema';
import { Play, Star } from 'lucide-react';
import { setAnimation } from '../actions';
import { playNodeAnimation } from '../canvas/animations';
import { cn } from '../lib/cn';
import { useDocumentStore } from '../store/document';
import { Btn, Group, NativeSelect, NumberInput, RangeSlider, Row, Segmented, Switch } from '../ui/primitives';

const PRESETS = listAnimationPresets();
const CATEGORY_LABEL: Record<string, string> = { entrance: 'Entrance', text: 'Text', media: 'Media', scroll: 'Scroll', layout: 'Choreography' };
const EASES = ['power1.out', 'power2.out', 'power3.out', 'power4.out', 'expo.out', 'sine.out', 'back.out(1.4)', 'power4.inOut', 'none'];

export function MotionTab({ node, disabled }: { node: Node; disabled?: boolean }) {
  const def = registry.get(node.type);
  const recommended = new Set(def?.animations?.recommended ?? []);
  const anim = node.animation;
  const intensity = useDocumentStore((s) => s.definition?.theme.motion.intensity);
  const preset = anim ? PRESET_MAP.get(anim.preset) : undefined;
  const defaults = preset?.defaults ?? {};
  const patch = (p: Partial<Animation>, key?: string) => {
    if (!anim) return;
    const next = { ...anim, ...p } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    setAnimation(node.id, next as Animation, key ? `anim:${node.id}:${key}` : undefined);
  };

  const groups = Object.entries(
    PRESETS.reduce<Record<string, typeof PRESETS>>((acc, p) => {
      (acc[p.category] ??= []).push(p);
      return acc;
    }, {}),
  );

  return (
    <>
      <Group id="motion-preset" title="Animation">
        {intensity === 'none' && <p className="rounded-md bg-warning-soft px-2 py-1.5 text-[11px] text-warning">Motion is turned off in the theme — animations will not play on the site.</p>}
        <div className="space-y-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAnimation(node.id, null)}
            className={cn('flex h-7 w-full items-center rounded-md border px-2 text-left text-xs', !anim ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2')}
          >
            None
          </button>
          {recommended.size > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                <Star className="size-3" /> Recommended for {def?.name}
              </p>
              <PresetGrid ids={[...recommended].filter((id) => PRESET_MAP.has(id))} current={anim?.preset} disabled={disabled} onPick={(id) => setAnimation(node.id, { preset: id })} recommended={recommended} />
            </div>
          )}
          {groups.map(([cat, list]) => (
            <div key={cat}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{CATEGORY_LABEL[cat] ?? cat}</p>
              <PresetGrid ids={list.map((p) => p.id)} current={anim?.preset} disabled={disabled} onPick={(id) => setAnimation(node.id, { ...(anim ?? {}), preset: id })} recommended={recommended} />
            </div>
          ))}
        </div>
      </Group>
      {anim && (
        <Group id="motion-params" title="Timing">
          <div className="flex justify-end">
            <Btn size="xs" variant="secondary" icon={<Play className="size-3" />} onClick={() => playNodeAnimation(node.id)}>
              Play preview
            </Btn>
          </div>
          <Row label="Trigger">
            <Segmented value={anim.trigger ?? defaults.trigger ?? 'scroll'} disabled={disabled} onChange={(trigger) => patch({ trigger })} options={[{ label: 'On load', value: 'load' }, { label: 'On scroll', value: 'scroll' }, { label: 'Hover', value: 'hover' }]} />
          </Row>
          <Row label="Duration">
            <SliderNumber value={anim.duration} fallback={defaults.duration ?? 0.9} min={0.1} max={4} step={0.05} unit="s" disabled={disabled} onChange={(duration, live) => patch({ duration }, live ? 'duration' : undefined)} />
          </Row>
          <Row label="Delay">
            <SliderNumber value={anim.delay} fallback={defaults.delay ?? 0} min={0} max={3} step={0.05} unit="s" disabled={disabled} onChange={(delay, live) => patch({ delay }, live ? 'delay' : undefined)} />
          </Row>
          <Row label="Distance">
            <SliderNumber value={anim.distance} fallback={defaults.distance ?? 30} min={0} max={160} step={1} unit="px" disabled={disabled} onChange={(distance, live) => patch({ distance }, live ? 'distance' : undefined)} />
          </Row>
          <Row label="Stagger">
            <SliderNumber value={anim.stagger} fallback={defaults.stagger ?? 0.1} min={0} max={0.6} step={0.01} unit="s" disabled={disabled} onChange={(stagger, live) => patch({ stagger }, live ? 'stagger' : undefined)} />
          </Row>
          <Row label="Easing">
            <NativeSelect value={anim.ease} placeholder={`Theme default${defaults.ease ? ` (${defaults.ease})` : ''}`} disabled={disabled} onChange={(ease) => patch({ ease: ease || undefined })} options={EASES.map((e) => ({ label: e, value: e }))} />
          </Row>
          <Row label="Animate">
            <NativeSelect
              value={anim.target ?? defaults.target ?? 'self'}
              disabled={disabled}
              onChange={(target) => patch({ target: target as Animation['target'] })}
              options={[{ label: 'Whole element', value: 'self' }, { label: 'Children (stagger)', value: 'children' }, { label: 'Words', value: 'words' }, { label: 'Characters', value: 'chars' }, { label: 'Lines', value: 'lines' }]}
            />
          </Row>
          {(anim.trigger ?? defaults.trigger ?? 'scroll') === 'scroll' && (
            <>
              <Row label="Scrub with scroll" className="grid-cols-[minmax(0,1fr)_auto]">
                <Switch checked={!!(anim.scrub ?? defaults.scrub)} disabled={disabled} onChange={(scrub) => patch({ scrub })} />
              </Row>
              <Row label="Play once" className="grid-cols-[minmax(0,1fr)_auto]">
                <Switch checked={anim.once ?? true} disabled={disabled} onChange={(once) => patch({ once })} />
              </Row>
            </>
          )}
          <p className="text-[11px] leading-4 text-fg-subtle">Durations and distances scale with the theme’s motion intensity ({intensity ?? 'subtle'}).</p>
        </Group>
      )}
    </>
  );
}

function PresetGrid({ ids, current, onPick, disabled, recommended }: { ids: string[]; current?: string; onPick: (id: string) => void; disabled?: boolean; recommended: Set<string> }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {ids.map((id) => {
        const p = PRESET_MAP.get(id)!;
        return (
          <button
            key={id}
            type="button"
            title={p.description}
            disabled={disabled}
            onClick={() => onPick(id)}
            className={cn('flex h-7 items-center gap-1 truncate rounded-md border px-2 text-left text-xs', current === id ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2')}
          >
            <span className="truncate">{p.name}</span>
            {recommended.has(id) && <Star className="size-2.5 shrink-0 fill-current text-warning" />}
          </button>
        );
      })}
    </div>
  );
}

function SliderNumber({ value, fallback, min, max, step, unit, onChange, disabled }: { value: number | undefined; fallback: number; min: number; max: number; step: number; unit: string; onChange: (v: number | undefined, live?: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <RangeSlider value={value ?? fallback} min={min} max={max} step={step} disabled={disabled} onChange={(v) => onChange(v, true)} />
      <NumberInput className="w-16 shrink-0" value={value} placeholder={String(fallback)} unit={unit} min={min} max={max} step={step} disabled={disabled} onCommit={(v) => onChange(v)} />
    </div>
  );
}
