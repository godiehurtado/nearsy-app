/**
 * Provider-aware reauthentication method for account deletion.
 * Derived from Firebase Auth `providerData`, not from Nearsy profile/entry path.
 */

export const FIREBASE_PROVIDER_PASSWORD = 'password' as const;
export const FIREBASE_PROVIDER_GOOGLE = 'google.com' as const;
export const FIREBASE_PROVIDER_APPLE = 'apple.com' as const;

export type FirebaseAuthProviderDataEntry = {
  providerId?: string | null;
  uid?: string | null;
  email?: string | null;
};

export type DeletionReauthMethod =
  | { kind: 'password' }
  | {
      kind: 'google';
      /** Firebase providerData.uid for google.com when present. */
      linkedProviderUserId?: string;
    }
  | {
      kind: 'apple';
      linkedProviderUserId?: string;
    }
  | {
      kind: 'unavailable';
      reason: 'no_supported_provider' | 'custom_token_only';
    };

/** Deterministic MVP priority when multiple providers are linked. */
export const DELETION_REAUTH_PRIORITY = [
  FIREBASE_PROVIDER_PASSWORD,
  FIREBASE_PROVIDER_GOOGLE,
  FIREBASE_PROVIDER_APPLE,
] as const;

export function listLinkedProviderIds(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry> | null | undefined,
): string[] {
  if (!providerData?.length) return [];
  const ids: string[] = [];
  for (const entry of providerData) {
    const id = typeof entry?.providerId === 'string' ? entry.providerId.trim() : '';
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function findProviderEntry(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry>,
  providerId: string,
): FirebaseAuthProviderDataEntry | undefined {
  return providerData.find((entry) => entry?.providerId === providerId);
}

/**
 * Resolve which reauthentication UX/path Delete Account should use.
 *
 * Supported for MVP: password, google.com, apple.com.
 * Empty providerData (typical custom-token / LinkedIn A3) → unavailable.
 */
export function resolveDeletionReauthMethod(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry> | null | undefined,
): DeletionReauthMethod {
  const entries = providerData ?? [];
  const linkedIds = listLinkedProviderIds(entries);

  if (linkedIds.length === 0) {
    return { kind: 'unavailable', reason: 'custom_token_only' };
  }

  for (const providerId of DELETION_REAUTH_PRIORITY) {
    if (!linkedIds.includes(providerId)) continue;

    if (providerId === FIREBASE_PROVIDER_PASSWORD) {
      return { kind: 'password' };
    }

    if (providerId === FIREBASE_PROVIDER_GOOGLE) {
      const linked = findProviderEntry(entries, FIREBASE_PROVIDER_GOOGLE);
      const linkedProviderUserId =
        typeof linked?.uid === 'string' && linked.uid.trim()
          ? linked.uid.trim()
          : undefined;
      return { kind: 'google', linkedProviderUserId };
    }

    if (providerId === FIREBASE_PROVIDER_APPLE) {
      const linked = findProviderEntry(entries, FIREBASE_PROVIDER_APPLE);
      const linkedProviderUserId =
        typeof linked?.uid === 'string' && linked.uid.trim()
          ? linked.uid.trim()
          : undefined;
      return { kind: 'apple', linkedProviderUserId };
    }
  }

  return { kind: 'unavailable', reason: 'no_supported_provider' };
}
