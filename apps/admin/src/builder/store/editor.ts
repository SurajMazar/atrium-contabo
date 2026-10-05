import type { Website } from '@atrium/sdk';
import { create } from 'zustand';

export interface EditorPermissions {
  edit: boolean;
  publish: boolean;
  theme: boolean;
  navigation: boolean;
  code: boolean;
  ai: boolean;
  createPage: boolean;
  deletePage: boolean;
  templates: boolean;
  preview: boolean;
}

export const ALL_PERMISSIONS: EditorPermissions = {
  edit: true, publish: true, theme: true, navigation: true, code: true, ai: true, createPage: true, deletePage: true, templates: true, preview: true,
};
export const NO_PERMISSIONS: EditorPermissions = {
  edit: false, publish: false, theme: false, navigation: false, code: false, ai: false, createPage: false, deletePage: false, templates: false, preview: false,
};

export interface EditorMetaState {
  websiteId: string | null;
  organizationId: string | null;
  website: Website | null;
  perms: EditorPermissions;
}

export const useEditorStore = create<EditorMetaState>()(() => ({ websiteId: null, organizationId: null, website: null, perms: ALL_PERMISSIONS }));

export function usePerms(): EditorPermissions {
  return useEditorStore((s) => s.perms);
}

export function canEdit(): boolean {
  return useEditorStore.getState().perms.edit;
}
