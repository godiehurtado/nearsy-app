import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  InstagramOwnershipGetResponse,
  InstagramOwnershipPending,
  InstagramOwnershipVerified,
} from './instagramOwnershipContract.ts';

export type InstagramOwnershipUiPhase =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'pending'
  | 'disconnecting';

export type InstagramOwnershipHint = 'expired' | 'conflict' | null;

export function instagramOwnershipActionBlocked(
  phase: InstagramOwnershipUiPhase,
): boolean {
  return (
    phase === 'loading' || phase === 'connecting' || phase === 'disconnecting'
  );
}

export function shouldPollInstagramOwnership(input: {
  screenFocused: boolean;
  appActive: boolean;
  pending: boolean;
  nowMs: number;
  expiresAtMs: number | null;
}): boolean {
  if (!input.screenFocused || !input.appActive || !input.pending) return false;
  if (input.expiresAtMs == null || !Number.isFinite(input.expiresAtMs)) {
    return false;
  }
  return input.expiresAtMs > input.nowMs;
}

export function instagramOwnershipHandleLabel(input: {
  usernameCache?: string | null;
  canonicalUrl?: string | null;
}): string | null {
  const user =
    typeof input.usernameCache === 'string' ? input.usernameCache.trim() : '';
  if (user) return `@${user.replace(/^@/, '')}`;
  const canonical =
    typeof input.canonicalUrl === 'string' ? input.canonicalUrl.trim() : '';
  return canonical || null;
}

export function presentInstagramGetResponse(get: InstagramOwnershipGetResponse): {
  verified: InstagramOwnershipVerified | null;
  challenge: InstagramOwnershipPending | null;
  phase: InstagramOwnershipUiPhase;
  hint: InstagramOwnershipHint;
  alertCode: string | null;
} {
  switch (get.result) {
    case 'verified':
      return {
        verified: get,
        challenge: null,
        phase: 'idle',
        hint: null,
        alertCode: null,
      };
    case 'pending':
      return {
        verified: null,
        challenge: get,
        phase: 'pending',
        hint: null,
        alertCode: null,
      };
    case 'expired':
      return {
        verified: null,
        challenge: null,
        phase: 'idle',
        hint: 'expired',
        alertCode: 'TX_EXPIRED',
      };
    case 'conflict':
      return {
        verified: null,
        challenge: null,
        phase: 'idle',
        hint: 'conflict',
        alertCode: 'instagram-account-claimed',
      };
    case 'not_linked':
      return {
        verified: null,
        challenge: null,
        phase: 'idle',
        hint: null,
        alertCode: null,
      };
  }
}

export function buildInstagramOwnershipModeView(input: {
  mode: ProfileMode;
  connected: boolean;
  handleLabel: string | null;
  phase: InstagramOwnershipUiPhase;
}) {
  return {
    mode: input.mode,
    connected: input.connected,
    handleLabel: input.connected ? input.handleLabel : null,
    phase: input.phase,
  };
}
