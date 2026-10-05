'use client';

import { KeyboardSensor, PointerSensor, useSensor, useSensors, type Announcements, type Modifier } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@atrium/ui';
import { GripVertical } from 'lucide-react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/** Lock dragging to the vertical axis (in-house; @dnd-kit/modifiers is not installed). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Pointer (with a small activation distance so clicks still work) + keyboard sensors. */
export function useSortSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
}

export interface SortableRenderProps {
  setNodeRef: (el: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
  handleProps: HTMLAttributes<HTMLElement>;
}

/** Render-prop wrapper around `useSortable` so any element (div, tr) can be sortable. */
export function Sortable({ id, disabled, children }: { id: string; disabled?: boolean; children: (p: SortableRenderProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <>
      {children({
        setNodeRef,
        style,
        isDragging,
        handleProps: { ...attributes, ...listeners, ref: setActivatorNodeRef } as HTMLAttributes<HTMLElement>,
      })}
    </>
  );
}

export function DragHandle({ label = 'Drag to reorder', className, disabled, ...props }: HTMLAttributes<HTMLElement> & { label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled ? undefined : label}
      disabled={disabled}
      {...(props as HTMLAttributes<HTMLButtonElement>)}
      className={cn(
        'inline-flex size-6 shrink-0 touch-none items-center justify-center rounded-sm text-fg-subtle outline-none transition-colors hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30',
        !disabled && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="size-3.5" strokeWidth={1.5} />
    </button>
  );
}

/** Screen-reader announcements using human labels. */
export function announcements(labelOf: (id: string) => string): Announcements {
  return {
    onDragStart: ({ active }) => `Picked up ${labelOf(String(active.id))}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(String(active.id))} moved over ${labelOf(String(over.id))}.` : `${labelOf(String(active.id))} is no longer over a drop target.`),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(String(active.id))} dropped at the position of ${labelOf(String(over.id))}.` : `${labelOf(String(active.id))} dropped.`),
    onDragCancel: ({ active }) => `Reordering cancelled. ${labelOf(String(active.id))} returned to its position.`,
  };
}
