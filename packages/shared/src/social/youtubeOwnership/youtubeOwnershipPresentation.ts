/**
 * Local presentation helpers for per-mode YouTube ownership (NEARSY-209).
 * Connection/view is scoped to the single editor mode on screen.
 */

import type { ProfileMode } from '../../profile/profileModeFields.ts';

export type YoutubeOwnershipUiPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'disconnecting';

export type YoutubeOwnershipModeConnectionView = {
  mode: ProfileMode;
  connected: boolean;
  /** Display label only — never log full URLs in callers. */
  channelLabel: string | null;
  phase: YoutubeOwnershipUiPhase;
};

export function youtubeOwnershipActionBlocked(
  phase: YoutubeOwnershipUiPhase,
): boolean {
  return phase === 'loading' || phase === 'connecting' || phase === 'disconnecting';
}

export function youtubeOwnershipChannelLabel(input: {
  customUrlCache?: string | null;
  canonicalUrl?: string | null;
  channelId?: string | null;
}): string | null {
  const custom =
    typeof input.customUrlCache === 'string' ? input.customUrlCache.trim() : '';
  if (custom) return custom;
  const canonical =
    typeof input.canonicalUrl === 'string' ? input.canonicalUrl.trim() : '';
  if (canonical) return canonical;
  const id = typeof input.channelId === 'string' ? input.channelId.trim() : '';
  return id || null;
}

/**
 * Build the card view for the editor mode currently on screen.
 * Connection is scoped to that mode only (no dual publish toggles).
 */
export function buildYoutubeOwnershipModeView(input: {
  mode: ProfileMode;
  connected: boolean;
  channelLabel: string | null;
  phase: YoutubeOwnershipUiPhase;
}): YoutubeOwnershipModeConnectionView {
  return {
    mode: input.mode,
    connected: input.connected,
    channelLabel: input.connected ? input.channelLabel : null,
    phase: input.phase,
  };
}
