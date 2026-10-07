/**
 * Sign-in methods shown in More → Sign-in methods (ENH-AUTH-LINK-01).
 *
 * Evidence only, never inferred from email:
 * - Email / Google / Facebook: Firebase `providerData` provider ids.
 * - LinkedIn: custom-token accounts never appear in `providerData`; the
 *   identity Functions derive their UID as `li_` + SHA-256 (base64url), reject
 *   any other shape and use the same prefix to recognize LinkedIn accounts.
 *   Firebase auto-generated UIDs are 28 alphanumeric characters, and LinkedIn
 *   sign-in can never reach any other UID. No other source is trusted.
 *
 * Google and Facebook are always listed so the person can connect them.
 * Phone is an identity check in Nearsy, not a sign-in method, so it is never
 * listed.
 */

export type SignInMethodId = 'email' | 'google' | 'facebook' | 'linkedin';

export type SignInMethodEntry = { id: SignInMethodId; connected: boolean };

export const LINKEDIN_FIREBASE_UID_PATTERN = /^li_[A-Za-z0-9_-]{5,}$/;

export function resolveSignInMethods(
  user:
    | { uid?: string | null; providerIds?: ReadonlyArray<string | null | undefined> }
    | null
    | undefined,
): SignInMethodEntry[] {
  const providerIds = new Set(
    (user?.providerIds ?? []).filter(
      (id): id is string => typeof id === 'string',
    ),
  );
  const entries: SignInMethodEntry[] = [];
  if (providerIds.has('password')) entries.push({ id: 'email', connected: true });
  entries.push({ id: 'google', connected: providerIds.has('google.com') });
  entries.push({ id: 'facebook', connected: providerIds.has('facebook.com') });

  const uid = typeof user?.uid === 'string' ? user.uid : '';
  if (LINKEDIN_FIREBASE_UID_PATTERN.test(uid)) {
    entries.push({ id: 'linkedin', connected: true });
  }
  return entries;
}
