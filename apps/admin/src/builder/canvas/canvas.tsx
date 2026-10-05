'use client';

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { AiPreviewBar } from '../ai/preview-bar';
import { BREAKPOINT_LABEL } from '../lib/devices';
import { insertComponent, insertTemplate, resolveInsertPlacement } from '../actions';
import { useDocumentStore } from '../store/document';
import { endDrag, select, selectBreakpoint, selectFrameWidth, selectZoom, useDragStore, useViewportStore } from '../store/ui';
import { CanvasFrame } from './frame';
import { CanvasContextMenu, CanvasOverlay } from './overlay';

const PAD = 32;

/**
 * Neutral canvas hosting the device-width iframe, centered and scaled
 * (zoom-to-fit by default). The iframe's height always fills the visible
 * canvas (in unscaled px) so `100vh` heroes behave like on a real device;
 * the page scrolls inside the iframe.
 */
export function Canvas() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const frameWidth = useViewportStore(selectFrameWidth);
  const zoom = useViewportStore(selectZoom);
  const breakpoint = useViewportStore(selectBreakpoint);
  const hasDoc = useDocumentStore((s) => !!s.definition);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit zoom never upscales beyond 100%.
  useEffect(() => {
    if (!size.w) return;
    const fit = Math.min(1, Math.max(0.1, (size.w - PAD * 2) / frameWidth));
    useViewportStore.setState({ fitZoom: Math.round(fit * 1000) / 1000 });
  }, [size.w, frameWidth]);

  const frameHeight = Math.max(320, Math.floor((size.h - PAD - 28) / zoom));
  const scaledW = frameWidth * zoom;
  const scaledH = frameHeight * zoom;

  // Drops onto the canvas margins append to the page.
  const onDragOver = (e: DragEvent) => {
    const p = useDragStore.getState().payload;
    if (p && (p.kind === 'template' || p.kind === 'component')) e.preventDefault();
  };
  const onDrop = (e: DragEvent) => {
    const p = useDragStore.getState().payload;
    e.preventDefault();
    endDrag();
    if (!p) return;
    if (p.kind === 'component') insertComponent(p.type, resolveInsertPlacement(p.type, null));
    else if (p.kind === 'template') insertTemplate(p.node, p.name, resolveInsertPlacement(p.node.type, null));
  };

  return (
    <div
      ref={ref}
      className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-canvas"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) select(null);
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <AiPreviewBar />
      {hasDoc && size.w > 0 && (
        <div className="flex min-h-full flex-col items-center" style={{ padding: `${PAD / 2}px ${PAD}px ${PAD / 2}px` }} onMouseDown={(e) => e.target === e.currentTarget && select(null)}>
          <div className="mb-1.5 flex h-4 w-full items-center justify-between text-[11px] text-fg-subtle" style={{ maxWidth: scaledW }}>
            <span>
              {BREAKPOINT_LABEL[breakpoint]} · {frameWidth}px
            </span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <div className="relative shrink-0 shadow-[0_1px_3px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.06)]" style={{ width: scaledW, height: scaledH }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: frameWidth, height: frameHeight, transform: zoom === 1 ? undefined : `scale(${zoom})` }}>
              <CanvasFrame width={frameWidth} height={frameHeight} />
            </div>
            <CanvasOverlay />
          </div>
        </div>
      )}
      <CanvasContextMenu />
    </div>
  );
}
