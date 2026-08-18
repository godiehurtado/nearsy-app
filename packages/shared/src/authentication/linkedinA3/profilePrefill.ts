/**
 * Queue LinkedIn Auth hints into the CRJ pending social profile store.
 * Does not write Firestore identity or set profileSetupCompleted.
 * Does not split displayName into last name.
 *
 * Precedence: givenName/familyName first; displayName fallback;
 * currentUser.displayName / photoURL last. photoUrl HTTPS only.
 */

import type { SocialProfileData } from '../social/domain/socialProfileData';
import { sanitizeSocialPhotoUrl } from '../social/application/mergeCompleteProfilePrefill';
import { setPendingSocialProfilePrefill } from '../social/application/socialProfilePrefillStore';
import type { LinkedInAuthProfileHints as LinkedInExchangeProfileHints } from './types';

export type LinkedInAuthProfileHints = {
  givenName?: string | null;
  familyName?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  photoURL?: string | null;
};

export type LinkedInPrefillQueueInput = LinkedInAuthProfileHints & {
  uid: string;
  profileComplete: boolean;
};

export type LinkedInPrefillQueueResult = {
  queued: boolean;
  hasDisplayName: boolean;
  hasPhotoUrl: boolean;
  hasGivenName: boolean;
  hasFamilyName: boolean;
};

function trimHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** HTTPS-only photo hint (CRJ remote preview). http and non-URL values are dropped. */
export function linkedInHttpsPhotoHint(photoURL: unknown): string | undefined {
  const sanitized = sanitizeSocialPhotoUrl(photoURL);
  if (!sanitized) return undefined;
  try {
    return new URL(sanitized).protocol === 'https:' ? sanitized : undefined;
  } catch {
    return undefined;
  }
}

export function mergeLinkedInProfileHints(input: {
  exchangeHints?: LinkedInExchangeProfileHints | LinkedInAuthProfileHints | null;
  authDisplayName?: string | null;
  authPhotoURL?: string | null;
}): LinkedInAuthProfileHints {
  const exchange = input.exchangeHints ?? {};
  const givenName = trimHint(exchange.givenName);
  const familyName = trimHint(exchange.familyName);
  const displayName =
    trimHint(exchange.displayName) ?? trimHint(input.authDisplayName);
  const photoUrl =
    linkedInHttpsPhotoHint(
      'photoUrl' in exchange ? exchange.photoUrl : undefined,
    ) ??
    linkedInHttpsPhotoHint(
      'photoURL' in exchange ? (exchange as LinkedInAuthProfileHints).photoURL : undefined,
    ) ??
    linkedInHttpsPhotoHint(input.authPhotoURL);

  return {
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  };
}

export function buildLinkedInSocialProfileFromAuthHints(
  hints: LinkedInAuthProfileHints,
): SocialProfileData | null {
  const givenName = trimHint(hints.givenName);
  const familyName = trimHint(hints.familyName);
  const displayName = trimHint(hints.displayName);
  const photoUrl =
    linkedInHttpsPhotoHint(hints.photoUrl) ??
    linkedInHttpsPhotoHint(hints.photoURL);
  if (!givenName && !familyName && !displayName && !photoUrl) return null;
  return {
    provider: 'linkedin',
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  };
}

/**
 * Store pending CRJ prefill only for incomplete profiles, before navigation.
 * Fail-soft: never throws.
 */
export function queueLinkedInCrjPrefillIfNeeded(
  input: LinkedInPrefillQueueInput,
): LinkedInPrefillQueueResult {
  const merged = mergeLinkedInProfileHints({
    exchangeHints: input,
    authDisplayName: input.displayName,
    authPhotoURL: input.photoURL ?? input.photoUrl,
  });
  const givenName = trimHint(merged.givenName);
  const familyName = trimHint(merged.familyName);
  const displayName = trimHint(merged.displayName);
  const photoUrl = linkedInHttpsPhotoHint(merged.photoUrl);
  const hasGivenName = Boolean(givenName);
  const hasFamilyName = Boolean(familyName);
  const hasDisplayName = Boolean(displayName);
  const hasPhotoUrl = Boolean(photoUrl);

  if (input.profileComplete) {
    return {
      queued: false,
      hasDisplayName,
      hasPhotoUrl,
      hasGivenName,
      hasFamilyName,
    };
  }

  const socialProfile = buildLinkedInSocialProfileFromAuthHints({
    givenName,
    familyName,
    displayName,
    photoUrl,
  });
  if (!socialProfile || !input.uid.trim()) {
    return {
      queued: false,
      hasDisplayName,
      hasPhotoUrl,
      hasGivenName,
      hasFamilyName,
    };
  }

  try {
    setPendingSocialProfilePrefill(input.uid, socialProfile);
    return {
      queued: true,
      hasDisplayName,
      hasPhotoUrl,
      hasGivenName,
      hasFamilyName,
    };
  } catch {
    return {
      queued: false,
      hasDisplayName,
      hasPhotoUrl,
      hasGivenName,
      hasFamilyName,
    };
  }
}
