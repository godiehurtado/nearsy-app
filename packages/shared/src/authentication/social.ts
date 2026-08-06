/**
 * Social auth adapter (Android).
 *
 * The Android app only supports Google as a social provider today, wired
 * through `googleProfilePrefillStore` + `authenticateWithGoogle`. This module
 * re-exports that Google-specific implementation under the provider-neutral
 * names the shared screens (ported from iOS CRJ) expect, so screens like
 * `ProfileCompletionScreen` can stay provider-agnostic.
 *
 * Do not add provider branching here — if a second social provider is added,
 * promote this into a real registry (see iOS `authentication/social`).
 */
export type {
  GoogleProfilePrefill as SocialProfilePrefill,
  CompleteProfilePrefillSeed,
} from './googleProfilePrefillStore';

export {
  isEmptyPrefillValue,
  mergeCompleteProfilePrefill,
  resolveProfileEmail,
} from './googleProfilePrefillStore';

import {
  clearPendingGoogleProfilePrefill,
  consumePendingGoogleProfilePrefill,
  peekPendingGoogleProfilePrefill,
  sanitizeGooglePhotoUrl,
  setPendingGoogleProfilePrefill,
  type GoogleProfilePrefill,
} from './googleProfilePrefillStore';

export const sanitizeSocialPhotoUrl = sanitizeGooglePhotoUrl;

export const setPendingSocialProfilePrefill = setPendingGoogleProfilePrefill;

export const consumePendingSocialProfilePrefill =
  consumePendingGoogleProfilePrefill;

export const clearPendingSocialProfilePrefill = clearPendingGoogleProfilePrefill;

/**
 * Read the pending prefill (and its owning uid) without clearing it.
 * Returns `null` when nothing is pending.
 */
export function peekPendingSocialProfilePrefill(): {
  uid: string;
  prefill: GoogleProfilePrefill;
} | null {
  return peekPendingGoogleProfilePrefill();
}
