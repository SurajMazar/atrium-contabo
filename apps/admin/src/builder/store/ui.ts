import type { Breakpoint } from '@atrium/schema';
import { create } from 'zustand';
import { breakpointForWidth, deviceWidth, DEVICES, type DeviceId } from '../lib/devices';

/* ───────────────────────── selection ───────────────────────── */

export interface SelectionState {
  selectedId: string | null;
  hoveredId: string | null;
  /** Node currently being edited inline in the canvas. */
  editingId: string | null;
}

export const useSelectionStore = create<SelectionState>()(() => ({ selectedId: null, hoveredId: null, editingId: null }));

export function select(id: string | null) {
  if (useSelectionStore.getState().selectedId !== id) useSelectionStore.setState({ selectedId: id });
}
export function hover(id: string | null) {
  if (useSelectionStore.getState().hoveredId !== id) useSelectionStore.setState({ hoveredId: id });
}
export function setEditing(id: string | null) {
  useSelectionStore.setState({ editingId: id });
}

/* ───────────────────────── viewport ───────────────────────── */

export type ZoomMode = 'fit' | number;

export interface ViewportState {
  device: DeviceId;
  customWidth: number;
  zoom: ZoomMode;
  /** Computed zoom when zoom === 'fit' (set by the canvas). */
  fitZoom: number;
  playAnimations: boolean;
  /** Bumped to replace the canvas iframe with a fresh document (drops scripts the live preview ran). */
  frameKey: number;
}

export const useViewportStore = create<ViewportState>()(() => ({
  device: 'desktop',
  customWidth: 1024,
  zoom: 'fit',
  fitZoom: 1,
  playAnimations: false,
  frameKey: 0,
}));

export function setDevice(device: DeviceId) {
  useViewportStore.setState({ device });
}
export function setCustomWidth(width: number) {
  useViewportStore.setState({ device: 'custom', customWidth: Math.round(width) });
}
export function setZoom(zoom: ZoomMode) {
  useViewportStore.setState({ zoom });
}

export function selectFrameWidth(s: ViewportState): number {
  return deviceWidth(s.device, s.customWidth);
}
export function selectBreakpoint(s: ViewportState): Breakpoint {
  if (s.device === 'custom') return breakpointForWidth(s.customWidth);
  return DEVICES.find((d) => d.id === s.device)!.breakpoint;
}
export function selectZoom(s: ViewportState): number {
  return s.zoom === 'fit' ? s.fitZoom : s.zoom;
}

/** Current editing breakpoint (hook). */
export function useBreakpoint(): Breakpoint {
  return useViewportStore(selectBreakpoint);
}

/* ───────────────────────── panels ───────────────────────── */

export type LeftTab = 'add' | 'sections' | 'pages' | 'layers' | 'cms' | 'media' | 'theme' | 'navigation' | 'ai';
export type InspectorTab = 'content' | 'style' | 'layout' | 'motion' | 'advanced';

export interface UiState {
  leftTab: LeftTab;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  inspectorTab: InspectorTab;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  publishOpen: boolean;
  historyOpen: boolean;
  /** Canvas context menu. */
  contextMenu: { x: number; y: number; nodeId: string } | null;
  /** Media picker request (opened from anywhere in the builder). */
  mediaRequest: { kind: 'image' | 'video' | 'any'; multiple?: boolean; onSelect: (media: Array<{ url: string; alt?: string | null; width?: number | null; height?: number | null; id: string; mimeType?: string; blurDataUrl?: string | null }>) => void } | null;
  /** Layers row currently being renamed. */
  renamingId: string | null;
  /** Generic single-field prompt (save as template, convert to global section…). */
  prompt: { title: string; description?: string; label: string; initial: string; confirmLabel: string; onConfirm: (value: string) => void | Promise<void> } | null;
}

export const useUiStore = create<UiState>()(() => ({
  leftTab: 'add',
  leftOpen: true,
  rightOpen: true,
  leftWidth: 248,
  rightWidth: 288,
  inspectorTab: 'content',
  paletteOpen: false,
  shortcutsOpen: false,
  publishOpen: false,
  historyOpen: false,
  contextMenu: null,
  mediaRequest: null,
  renamingId: null,
  prompt: null,
}));

export function openPrompt(p: NonNullable<UiState['prompt']>) {
  useUiStore.setState({ prompt: p });
}

export function requestMedia(req: NonNullable<UiState['mediaRequest']>) {
  useUiStore.setState({ mediaRequest: req });
}

export function openLeft(tab: LeftTab) {
  const s = useUiStore.getState();
  if (s.leftOpen && s.leftTab === tab) return;
  useUiStore.setState({ leftTab: tab, leftOpen: true });
}
export function toggleLeft(tab: LeftTab) {
  const s = useUiStore.getState();
  if (s.leftOpen && s.leftTab === tab) useUiStore.setState({ leftOpen: false });
  else useUiStore.setState({ leftTab: tab, leftOpen: true });
}
export function togglePanels() {
  const s = useUiStore.getState();
  const anyOpen = s.leftOpen || s.rightOpen;
  useUiStore.setState({ leftOpen: !anyOpen, rightOpen: !anyOpen });
}

/* ───────────────────────── drag ───────────────────────── */

export type DragPayload =
  | { kind: 'component'; type: string }
  | { kind: 'template'; name: string; node: import('@atrium/schema').NodeInput }
  | { kind: 'move'; nodeId: string; type: string }
  | { kind: 'media'; media: { url: string; alt?: string | null; width?: number | null; height?: number | null; id: string; mimeType?: string } };

export interface DragState {
  payload: DragPayload | null;
  indicator: { refId: string | null; position: 'before' | 'after' | 'inside'; axis: 'vertical' | 'horizontal'; label?: string } | null;
}

export const useDragStore = create<DragState>()(() => ({ payload: null, indicator: null }));

export function startDrag(payload: DragPayload) {
  useDragStore.setState({ payload, indicator: null });
}
export function endDrag() {
  useDragStore.setState({ payload: null, indicator: null });
}
