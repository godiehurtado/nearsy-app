/**
 * Queue LinkedIn Auth hints into the CRJ pending social profile store.
 * Does not write Firestore identity or set profileSetupCompleted.
 * Does not split displayName into last name.
 */

import type { SocialProfileData } from '../social/domain/socialProfileData';
import { sanitizeSocialPhotoUrl } from '../social/application/mergeCompleteProfilePrefill';
import { setPendingSocialProfilePrefill } from '../social/application/socialProfilePrefillStore';

export type LinkedInAuthProfileHints = {
  displayName?: string | null;
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

export function buildLinkedInSocialProfileFromAuthHints(
  hints: LinkedInAuthProfileHints,
): SocialProfileData | null {
  const displayName = trimHint(hints.displayName);
  const photoUrl = linkedInHttpsPhotoHint(hints.photoURL);
  if (!displayName && !photoUrl) return null;
  return {
    provider: 'linkedin',
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
  const displayName = trimHint(input.displayName);
  const photoUrl = linkedInHttpsPhotoHint(input.photoURL);
  const hasDisplayName = Boolean(displayName);
  const hasPhotoUrl = Boolean(photoUrl);

  if (input.profileComplete) {
    return { queued: false, hasDisplayName, hasPhotoUrl };
  }

  const socialProfile = buildLinkedInSocialProfileFromAuthHints({
    displayName,
    photoURL: photoUrl,
  });
  if (!socialProfile || !input.uid.trim()) {
    return { queued: false, hasDisplayName, hasPhotoUrl };
  }

  try {
    setPendingSocialProfilePrefill(input.uid, socialProfile);
    return { queued: true, hasDisplayName, hasPhotoUrl };
  } catch {
    return { queued: false, hasDisplayName, hasPhotoUrl };
  }
}
