import type { WebsiteDefinition } from '@atrium/schema';
import { mutate, useDocumentStore } from '../store/document';

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Bring the local document to the server's state as ONE undoable entry,
 * replacing only what actually differs (unchanged pages keep identity, so
 * dirty-tracking and memoized canvas nodes are unaffected).
 */
export function adoptServerDefinition(server: WebsiteDefinition, label: string, source: 'ai' | 'system' = 'ai'): boolean {
  const current = useDocumentStore.getState().definition;
  if (!current) return false;
  const keys = ['settings', 'theme', 'navigation', 'header', 'footer', 'globalSections', 'forms', 'collections', 'redirects', 'customCss'] as const;
  return mutate(label, (draft) => {
    for (const k of keys) {
      if (!same(current[k], server[k])) (draft as Record<string, unknown>)[k] = server[k];
    }
    const pagesChanged = current.pages.length !== server.pages.length || server.pages.some((sp, i) => current.pages[i]?.id !== sp.id || !same(current.pages[i], sp));
    if (pagesChanged) {
      server.pages.forEach((sp, i) => {
        const local = current.pages.find((p) => p.id === sp.id);
        const keep = local && same(local, sp);
        if (draft.pages[i]?.id === sp.id && keep) return;
        draft.pages[i] = keep ? local : sp;
      });
      if (draft.pages.length > server.pages.length) draft.pages.splice(server.pages.length);
    }
  }, { source });
}
