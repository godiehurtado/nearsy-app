import type { SocialProfileData } from '../domain/socialProfileData';

/**
 * Serializable CompleteProfile seed fields that Google may influence (TS-008).
 * Email is included for routing/identity only — CompleteProfile has no email input.
 */
export interface CompleteProfilePrefillSeed {
  realName?: string | null;
  profileImage?: string | null;
  email?: string | null;
}

export function isEmptyPrefillValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

function trimOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Build a single realName from Google structured names without unsafe splitting.
 * Prefer given + family; fall back to displayName only when both are absent.
 */
export function mapSocialNameToRealName(
  social: Pick<SocialProfileData, 'givenName' | 'familyName' | 'displayName'>,
): string | undefined {
  const given = trimOrEmpty(social.givenName);
  const family = trimOrEmpty(social.familyName);
  if (given || family) {
    return [given, family].filter(Boolean).join(' ');
  }

  const display = trimOrEmpty(social.displayName);
  return display || undefined;
}

/**
 * Accept only http(s) remote image URLs for optional profile photo preview (TS-008 v1.1).
 *
 * Google avatars are used as remote HTTPS prefills only. They are not copied into
 * Firebase Storage. The URL is written to Firestore `profileImage` only when the
 * user saves CompleteProfile. Existing non-empty profile images always win.
 * A future enhancement may copy provider avatars into Nearsy-managed Storage.
 */
export function sanitizeSocialPhotoUrl(value: unknown): string | undefined {
  const url = trimOrEmpty(value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Merge Google suggestions into CompleteProfile seed values.
 * Precedence: existing non-empty seed → eligible Google → empty.
 * Never infers birth year, phone, interests, or locale into form fields.
 */
export function mergeCompleteProfilePrefill(
  existing: CompleteProfilePrefillSeed,
  social: SocialProfileData,
): CompleteProfilePrefillSeed {
  const next: CompleteProfilePrefillSeed = {
    realName: existing.realName ?? '',
    profileImage: existing.profileImage ?? null,
    email: existing.email ?? null,
  };

  if (isEmptyPrefillValue(next.realName)) {
    const mappedName = mapSocialNameToRealName(social);
    if (mappedName) {
      next.realName = mappedName;
    }
  } else if (typeof next.realName === 'string') {
    next.realName = next.realName.trim();
  }

  if (isEmptyPrefillValue(next.profileImage)) {
    const photo = sanitizeSocialPhotoUrl(social.photoUrl);
    if (photo) {
      next.profileImage = photo;
    }
  }

  if (isEmptyPrefillValue(next.email)) {
    const email = trimOrEmpty(social.email);
    if (email) {
      next.email = email;
    }
  } else if (typeof next.email === 'string') {
    next.email = next.email.trim();
  }

  return next;
}
