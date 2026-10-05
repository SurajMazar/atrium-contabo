'use client';

import type { FormDefinition, FormField } from '@atrium/schema';
import { createContext, useContext } from 'react';
import type { FormIssue } from '../form-model';

export interface FormEditorValue {
  draft: FormDefinition;
  setDraft: (updater: (prev: FormDefinition) => FormDefinition) => void;
  updateField: (id: string, patch: Partial<FormField>) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  readOnly: boolean;
  issues: FormIssue[];
  websiteId: string;
  organizationId: string | undefined;
}

const Ctx = createContext<FormEditorValue | null>(null);
export const FormEditorProvider = Ctx.Provider;

export function useFormEditor(): FormEditorValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFormEditor must be used inside the form builder');
  return v;
}
