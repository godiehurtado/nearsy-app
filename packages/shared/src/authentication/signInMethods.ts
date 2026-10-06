/**
 * Sign-in methods shown in More → Sign-in methods (ENH-AUTH-LINK-01).
 *
 * Evidence only, never inferred from email:
 * - Email / Google / Facebook: Firebase `providerData` provider ids.
 * - LinkedIn: custom-token accounts never appear in `providerData`; the
 *   identity Functions derive their UID as `li_` + SHA-256 (base64url) and
 *   reject any other shape, while Firebase auto-generated UIDs are 28
 *   alphanumeric characters. No other source is trusted.
 *
 * Facebook is always listed so the person can connect it.
 */

export type SignInMethodId = 'email' | 'google' | 'facebook' | 'linkedin';

export type SignInMethodEntry = { id: SignInMethodId; connected: boolean };

export const LINKEDIN_FIREBASE_UID_PATTERN = /^li_[A-Za-z0-9_-]{5,}$/;

const PROVIDER_METHODS: ReadonlyArray<[string, SignInMethodId]> = [
  ['password', 'email'],
  ['google.com', 'google'],
];

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
  const entries: SignInMethodEntry[] = PROVIDER_METHODS.filter(([providerId]) =>
    providerIds.has(providerId),
  ).map(([, id]) => ({ id, connected: true }));

  entries.push({ id: 'facebook', connected: providerIds.has('facebook.com') });

  const uid = typeof user?.uid === 'string' ? user.uid : '';
  if (LINKEDIN_FIREBASE_UID_PATTERN.test(uid)) {
    entries.push({ id: 'linkedin', connected: true });
  }
  return entries;
}
