import type { ChangeSummary, SiteOperation } from '@atrium/builder-core';
import type { AiProposal } from '@atrium/sdk';
import type { WebsiteDefinition } from '@atrium/schema';
import { create } from 'zustand';

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** Proposal attached to an assistant message. */
  proposal?: AiProposal;
  kind?: 'edit' | 'section' | 'page';
  status?: 'proposed' | 'applied' | 'discarded';
  at: number;
}

export interface AiPreview {
  generationId: string;
  /** Scratch definition with the proposal applied (rendered by the canvas while previewing). */
  definition: WebsiteDefinition;
  showAfter: boolean;
  changes: ChangeSummary[];
  error?: string;
  /** Operations being previewed (re-simulated when the draft changes underneath). */
  operations: SiteOperation[];
}

export interface AiState {
  messages: AiMessage[];
  pending: boolean;
  preview: AiPreview | null;
  /** Prefill for the composer (e.g. "Ask AI about this section"). */
  draft: string;
  focusTick: number;
}

export const useAiStore = create<AiState>()(() => ({ messages: [], pending: false, preview: null, draft: '', focusTick: 0 }));

export function askAi(prefill = '') {
  useAiStore.setState((s) => ({ draft: prefill || s.draft, focusTick: s.focusTick + 1 }));
}
