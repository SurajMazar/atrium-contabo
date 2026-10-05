'use client';

import type { Control, ControlType } from '@atrium/component-registry';
import type { Node } from '@atrium/schema';
import { memo, type ComponentType } from 'react';
import { Row } from '../ui/primitives';
import {
  CodeControl, DateControl, NumberControl, RewriteMenu, SegmentedControl, SelectControl, SliderControl, TextControl, TextareaControl, ToggleControl,
} from './controls/basic';
import { ColorControl } from './controls/color';
import { IconControl } from './controls/icon';
import { LinkControl } from './controls/link';
import { ListControl } from './controls/list';
import { MediaControl } from './controls/media';
import { ButtonControl, CollectionControl, FormControl, MenuControl } from './controls/refs';
import { RichTextControl } from './controls/richtext';
import type { ControlProps } from './controls/types';

const REGISTRY: Record<ControlType, ComponentType<ControlProps<never>>> = {
  text: TextControl,
  textarea: TextareaControl,
  richtext: RichTextControl,
  number: NumberControl,
  slider: SliderControl,
  select: SelectControl,
  segmented: SegmentedControl,
  toggle: ToggleControl,
  color: ColorControl,
  media: MediaControl,
  link: LinkControl,
  icon: IconControl,
  list: ListControl,
  form: FormControl,
  collection: CollectionControl,
  menu: MenuControl,
  code: CodeControl,
  date: DateControl,
  button: ButtonControl,
} as unknown as Record<ControlType, ComponentType<ControlProps<never>>>;

const STACKED = new Set<ControlType>(['textarea', 'richtext', 'media', 'list', 'link', 'code', 'button', 'slider']);

/** Inline value column is ~168px at the default inspector width. */
const INLINE_WIDTH = 168;

/** Segmented controls whose labels would be clipped inline get the full row width instead. */
function segmentedNeedsRow(control: Control): boolean {
  if (control.type !== 'segmented') return false;
  const options = control.options ?? [];
  // Segments share the width equally, so the widest label decides.
  const widest = options.reduce((w, o) => Math.max(w, o.icon ? 28 : String(o.label ?? '').length * (options.length >= 3 ? 6.1 : 6.6) + 10), 28);
  return options.length * widest + 4 > INLINE_WIDTH;
}

export interface ControlFieldProps {
  control: Control;
  value: unknown;
  onChange: (value: unknown, opts?: { mergeKey?: string }) => void;
  node?: Node;
  disabled?: boolean;
  idPrefix?: string;
}

/** Generic inspector row for one registry `Control`. */
export const ControlField = memo(function ControlField({ control, value, onChange, node, disabled, idPrefix = 'f' }: ControlFieldProps) {
  const Comp = REGISTRY[control.type] as unknown as ComponentType<ControlProps<unknown>> | undefined;
  const id = `${idPrefix}-${node?.id ?? 'x'}-${control.name}`;
  if (!Comp) {
    return (
      <Row label={control.label}>
        <span className="text-xs text-fg-subtle">Unsupported control “{control.type}”</span>
      </Row>
    );
  }
  const rewrite = (control.type === 'text' || control.type === 'textarea') && typeof value === 'string' ? <RewriteMenu value={value} disabled={disabled} onResult={(v) => onChange(v)} /> : null;
  const body = <Comp control={control} value={value} onChange={onChange} node={node} disabled={disabled} id={id} />;
  if (control.type === 'toggle') {
    return (
      <Row label={control.label} help={control.help} htmlFor={id} className="grid-cols-[minmax(0,1fr)_auto]">
        {body}
      </Row>
    );
  }
  return (
    <Row label={control.label} help={control.help} htmlFor={id} stacked={STACKED.has(control.type) || segmentedNeedsRow(control)} actions={rewrite}>
      {body}
    </Row>
  );
});
