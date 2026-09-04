/**
 * Android social auth / CRJ prefill barrel.
 * Bridges Google in-memory prefill (Android) to the provider-neutral CRJ API.
 */

export type {
  GoogleProfilePrefill as SocialProfilePrefill,
  CompleteProfilePrefillSeed,
} from '../googleProfilePrefillStore';

export {
  isEmptyPrefillValue,
  mergeCompleteProfilePrefill,
  resolveProfileEmail,
} from '../googleProfilePrefillStore';

import {
  clearPendingGoogleProfilePrefill,
  consumePendingGoogleProfilePrefill,
  peekPendingGoogleProfilePrefill,
  sanitizeGooglePhotoUrl,
  setPendingGoogleProfilePrefill,
  type GoogleProfilePrefill,
} from '../googleProfilePrefillStore';

import type { SocialProfileData } from './domain/socialProfileData';
export type { SocialProfileData } from './domain/socialProfileData';

export {
  resolveCrjNamePrefill,
  type AppliedSocialNamePrefill,
  type ResolveCrjNamePrefillInput,
  type ResolveCrjNamePrefillResult,
  type SocialNamePrefillSource,
} from './application/resolveCrjNamePrefill';

export {
  commitPendingSocialNamePrefill,
  peekAppliedSocialNamePrefill,
} from './application/socialProfilePrefillStore';

export { mapSocialProfileToNamePrefill } from './application/mapSocialNamePrefill';

export const sanitizeSocialPhotoUrl = sanitizeGooglePhotoUrl;

export const setPendingSocialProfilePrefill = setPendingGoogleProfilePrefill;

export const clearPendingSocialProfilePrefill = clearPendingGoogleProfilePrefill;

export function consumePendingSocialProfilePrefill(
  uid: string,
): SocialProfileData | null {
  const google = consumePendingGoogleProfilePrefill(uid);
  if (!google) return null;
  return googlePrefillToSocialProfile(google);
}

/**
 * Read pending Google prefill without clearing, shaped for CRJ Name step.
 */
export function peekPendingSocialProfilePrefill(): {
  uid: string;
  socialProfile: SocialProfileData;
} | null {
  const pending = peekPendingGoogleProfilePrefill();
  if (!pending) return null;
  return {
    uid: pending.uid,
    socialProfile: googlePrefillToSocialProfile(pending.prefill),
  };
}

function googlePrefillToSocialProfile(
  prefill: GoogleProfilePrefill,
): SocialProfileData {
  return {
    provider: 'google',
    email: prefill.email,
    displayName: prefill.displayName,
    givenName: prefill.givenName,
    familyName: prefill.familyName,
    photoUrl: prefill.photoUrl,
  };
}
