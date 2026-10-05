'use client';

/**
 * Client entry (`@atrium/renderer-core/client`): the per-page runtime and the interactive islands.
 * Everything here is safe to import from client components only.
 */
export { SiteRuntime, type SiteRuntimeProps } from './islands/runtime';
export { FormIsland, type FormIslandProps } from './islands/form';
export { Carousel } from './islands/carousel';
export { Lightbox } from './islands/lightbox';
export { Tabs, Dialog, BeforeAfter, RotatingWords, VideoFacade, StickySteps } from './islands/interactive';
export { MapFacade } from './islands/map-facade';
export { BookingWidget } from './islands/booking';
export { HeaderBehavior } from './islands/header-behavior';
export { Crossfade } from './islands/crossfade';
