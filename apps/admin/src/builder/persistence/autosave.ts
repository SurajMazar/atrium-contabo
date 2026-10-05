'use client';

import type { AtriumClient } from '@atrium/sdk';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useDocumentStore } from '../store/document';
import { SaveController, type SaveApi, type SaveState } from './save-controller';

export const useSaveStore = create<SaveState>()(() => ({ status: 'idle', lastSavedAt: null, error: null, conflict: null, dirtyCount: 0 }));

let controller: SaveController | null = null;

export function saveApiFor(api: AtriumClient, websiteId: string): SaveApi {
  return {
    savePage: (pageId, body) => api.pages.update(pageId, body),
    saveSite: (body) => api.websites.saveSite(websiteId, body),
    saveTheme: (body) => api.websites.saveTheme(websiteId, body),
    saveGlobalSection: (id, body) => api.globalSections.update(id, body),
  };
}

export function createSaveController(api: AtriumClient, websiteId: string): SaveController {
  controller?.dispose();
  controller = new SaveController({
    api: saveApiFor(api, websiteId),
    getDefinition: () => useDocumentStore.getState().definition,
    onState: (s) => useSaveStore.setState(s),
  });
  return controller;
}

export function getSaveController(): SaveController | null {
  return controller;
}

/** Force an immediate save of everything dirty. */
export function flushSaves(): Promise<boolean> {
  return controller?.flush() ?? Promise.resolve(true);
}

/**
 * Wire the controller to document changes, connectivity and page unload.
 * Mounted once by the editor root.
 */
export function useAutosaveWiring(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lastDef = useDocumentStore.getState().definition;
    const unsub = useDocumentStore.subscribe((s) => {
      if (s.definition !== lastDef) {
        lastDef = s.definition;
        controller?.notifyChange();
      }
    });
    const onOnline = () => controller?.handleOnline();
    const onOffline = () => {
      if (controller && controller.hasUnsaved()) useSaveStore.setState({ status: 'offline' });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (controller?.hasUnsaved()) {
        void controller.flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void controller?.flush();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
