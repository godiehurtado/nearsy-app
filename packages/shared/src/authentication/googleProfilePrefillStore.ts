/**
 * Google Profile Prefill (TS-008 Android).
 *
 * Safe identity suggestions + in-memory one-shot store.
 * Never includes tokens. Never persists to AsyncStorage / Firestore.
 */

export interface GoogleProfilePrefill {
  email?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  photoUrl?: string;
}

/** Serializable CompleteProfile seed fields Google may influence. */
export interface CompleteProfilePrefillSeed {
  realName?: string | null;
  profileImage?: string | null;
  email?: string | null;
}

type PendingPrefill = {
  uid: string;
  prefill: GoogleProfilePrefill;
};

let pending: PendingPrefill | null = null;

export function isEmptyPrefillValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

function trimOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function trimToUndefined(value: unknown): string | undefined {
  const trimmed = trimOrEmpty(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build realName from Google fields.
 * Official order: displayName → givenName + familyName → empty.
 */
export function mapGoogleNameToRealName(
  social: Pick<
    GoogleProfilePrefill,
    'displayName' | 'givenName' | 'familyName'
  >,
): string | undefined {
  const display = trimOrEmpty(social.displayName);
  if (display) {
    return display;
  }

  const given = trimOrEmpty(social.givenName);
  const family = trimOrEmpty(social.familyName);
  if (given || family) {
    return [given, family].filter(Boolean).join(' ');
  }

  return undefined;
}

/**
 * Accept only https remote image URLs for optional profile photo preview.
 * Rejects non-https schemes (including http) per TS-008 Android approval.
 */
export function sanitizeGooglePhotoUrl(value: unknown): string | undefined {
  const url = trimOrEmpty(value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Normalize raw Google identity fields into a token-free prefill contract.
 * Fail-soft: never throws for malformed optional fields.
 */
export function buildGoogleProfilePrefill(input: {
  email?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  photoUrl?: string | null;
}): GoogleProfilePrefill {
  const prefill: GoogleProfilePrefill = {};

  const email = trimToUndefined(input.email);
  if (email) prefill.email = email;

  const displayName = trimToUndefined(input.displayName);
  if (displayName) prefill.displayName = displayName;

  const givenName = trimToUndefined(input.givenName);
  if (givenName) prefill.givenName = givenName;

  const familyName = trimToUndefined(input.familyName);
  if (familyName) prefill.familyName = familyName;

  const photoUrl = sanitizeGooglePhotoUrl(input.photoUrl);
  if (photoUrl) prefill.photoUrl = photoUrl;

  return prefill;
}

/**
 * Resolve email for CompleteProfile seed / submit.
 * Precedence: Firestore → local → Firebase Auth → Google → empty.
 */
export function resolveProfileEmail(input: {
  firestoreEmail?: string | null;
  localEmail?: string | null;
  firebaseAuthEmail?: string | null;
  googleEmail?: string | null;
}): string | undefined {
  return (
    trimToUndefined(input.firestoreEmail) ??
    trimToUndefined(input.localEmail) ??
    trimToUndefined(input.firebaseAuthEmail) ??
    trimToUndefined(input.googleEmail)
  );
}

/**
 * Merge Google suggestions into CompleteProfile seed values.
 * Precedence: existing non-empty seed → eligible Google → empty.
 * Never infers birth year, phone, interests, or locale into form fields.
 */
export function mergeCompleteProfilePrefill(
  existing: CompleteProfilePrefillSeed,
  social: GoogleProfilePrefill,
  options?: { firebaseAuthEmail?: string | null },
): CompleteProfilePrefillSeed {
  const next: CompleteProfilePrefillSeed = {
    realName: existing.realName ?? '',
    profileImage: existing.profileImage ?? null,
    email: existing.email ?? null,
  };

  if (isEmptyPrefillValue(next.realName)) {
    const mappedName = mapGoogleNameToRealName(social);
    if (mappedName) {
      next.realName = mappedName;
    }
  } else if (typeof next.realName === 'string') {
    next.realName = next.realName.trim();
  }

  if (isEmptyPrefillValue(next.profileImage)) {
    const photo = sanitizeGooglePhotoUrl(social.photoUrl);
    if (photo) {
      next.profileImage = photo;
    }
  }

  if (isEmptyPrefillValue(next.email)) {
    const email = resolveProfileEmail({
      firestoreEmail: null,
      localEmail: next.email,
      firebaseAuthEmail: options?.firebaseAuthEmail,
      googleEmail: social.email,
    });
    if (email) {
      next.email = email;
    }
  } else if (typeof next.email === 'string') {
    next.email = next.email.trim();
  }

  return next;
}

export function setPendingGoogleProfilePrefill(
  uid: string,
  prefill: GoogleProfilePrefill,
): void {
  if (!uid?.trim()) return;
  if (Object.keys(prefill).length === 0) return;
  pending = { uid, prefill };
}

/**
 * Read the pending prefill (and its owning uid) without clearing it.
 * Used to check "is there something pending for this uid?" before
 * committing to a one-shot consume.
 */
export function peekPendingGoogleProfilePrefill(): PendingPrefill | null {
  return pending;
}

/**
 * Returns and clears pending prefill when uid matches.
 */
export function consumePendingGoogleProfilePrefill(
  uid: string,
): GoogleProfilePrefill | null {
  if (!pending || pending.uid !== uid) {
    return null;
  }
  const value = pending.prefill;
  pending = null;
  return value;
}

export function clearPendingGoogleProfilePrefill(): void {
  pending = null;
}
