/**
 * Maps Identity Get results to Own Profile UI.
 * Never starts a new challenge — expired/conflict/not_linked do not auto-Start.
 */

import type { InstagramOwnershipErrorCode } from './errors';
import type {
  InstagramOwnershipGetResponse,
  InstagramOwnershipPending,
  InstagramOwnershipVerified,
} from './wireTypes';

export type InstagramGetHint = 'expired' | 'conflict';

export type InstagramGetPresentation = {
  verified: InstagramOwnershipVerified | null;
  challenge: InstagramOwnershipPending | null;
  phase: 'idle' | 'pending';
  hint: InstagramGetHint | null;
  needsRetry: boolean;
  alertCode: InstagramOwnershipErrorCode | null;
};

export function presentInstagramGetResponse(
  get: InstagramOwnershipGetResponse,
): InstagramGetPresentation {
  switch (get.result) {
    case 'verified':
      return {
        verified: get,
        challenge: null,
        phase: 'idle',
        hint: null,
        needsRetry: false,
        alertCode: null,
      };
    case 'pending':
      return {
        verified: null,
        challenge: get,
        phase: 'pending',
        hint: null,
        needsRetry: false,
        alertCode: null,
      };
    case 'expired':
      return {
        verified: null,
        challenge: null,
        phase: 'idle',
        hint: 'expired',
        needsRetry: true,
        alertCode: 'TX_EXPIRED',
      };
    case 'conflict':
      return {
        verified: null,
        challenge: null,
        phase: 'idle',
        hint: 'conflict',
        needsRetry: true,
        alertCode: 'INSTAGRAM_ACCOUNT_CLAIMED',
      };
    case 'not_linked':
      return {
        verified: null,
        challenge: null,
        phase: 'idle',
        hint: null,
        needsRetry: false,
        alertCode: null,
      };
  }
}
