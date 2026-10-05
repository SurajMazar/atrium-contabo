import type { Modifier } from '@dnd-kit/core';

/** Lock drags to the vertical axis (lists). Local copy to avoid adding @dnd-kit/modifiers. */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
