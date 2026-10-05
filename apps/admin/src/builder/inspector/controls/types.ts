import type { Control } from '@atrium/component-registry';
import type { Node } from '@atrium/schema';

export interface ControlProps<T = unknown> {
  control: Control;
  value: T;
  /** `mergeKey` lets continuous edits (slider drags, typing) collapse into one undo step. */
  onChange: (value: T | undefined, opts?: { mergeKey?: string }) => void;
  node?: Node;
  disabled?: boolean;
  /** Stable id for label association. */
  id: string;
}
