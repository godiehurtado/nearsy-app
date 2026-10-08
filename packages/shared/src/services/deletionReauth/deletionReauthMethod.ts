/**
 * Provider-aware reauthentication method for account deletion.
 * Derived from Firebase Auth `providerData` and the deterministic LinkedIn UID,
 * never from the email or the Nearsy profile/entry path.
 */
import { isLinkedInDeterministicUid } from './linkedInDeletionReauth';

export const FIREBASE_PROVIDER_PASSWORD = 'password' as const;
export const FIREBASE_PROVIDER_GOOGLE = 'google.com' as const;
export const FIREBASE_PROVIDER_APPLE = 'apple.com' as const;
export const FIREBASE_PROVIDER_FACEBOOK = 'facebook.com' as const;

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
      kind: 'facebook';
      linkedProviderUserId?: string;
    }
  | { kind: 'linkedin' }
  | {
      kind: 'unavailable';
      reason: 'no_supported_provider' | 'custom_token_only' | 'linkedin_sign_in_again';
    };

export type AvailableDeletionReauthMethod = Exclude<DeletionReauthMethod, { kind: 'unavailable' }>;

export type DeletionReauthContext = {
  /** Firebase Auth UID of the signed-in user. */
  uid?: string | null;
  /** Whether the LinkedIn A3 flow can run in this runtime. */
  linkedInReauthAvailable?: boolean;
};

/** Deterministic MVP priority when multiple providers are linked. */
export const DELETION_REAUTH_PRIORITY = [
  FIREBASE_PROVIDER_PASSWORD,
  FIREBASE_PROVIDER_GOOGLE,
  FIREBASE_PROVIDER_APPLE,
  FIREBASE_PROVIDER_FACEBOOK,
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

function linkedProviderUserId(
  entries: ReadonlyArray<FirebaseAuthProviderDataEntry>,
  providerId: string,
): string | undefined {
  const linked = findProviderEntry(entries, providerId);
  return typeof linked?.uid === 'string' && linked.uid.trim() ? linked.uid.trim() : undefined;
}

/**
 * Every reauthentication method actually linked to this account, in
 * deterministic priority order. LinkedIn (custom token, no providerData entry)
 * is last and only when the UID is the deterministic LinkedIn UID.
 */
export function resolveDeletionReauthMethods(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry> | null | undefined,
  context: DeletionReauthContext = {},
): AvailableDeletionReauthMethod[] {
  const entries = providerData ?? [];
  const linkedIds = listLinkedProviderIds(entries);
  const methods: AvailableDeletionReauthMethod[] = [];

  for (const providerId of DELETION_REAUTH_PRIORITY) {
    if (!linkedIds.includes(providerId)) continue;
    if (providerId === FIREBASE_PROVIDER_PASSWORD) {
      methods.push({ kind: 'password' });
    } else if (providerId === FIREBASE_PROVIDER_GOOGLE) {
      methods.push({ kind: 'google', linkedProviderUserId: linkedProviderUserId(entries, providerId) });
    } else if (providerId === FIREBASE_PROVIDER_APPLE) {
      methods.push({ kind: 'apple', linkedProviderUserId: linkedProviderUserId(entries, providerId) });
    } else if (providerId === FIREBASE_PROVIDER_FACEBOOK) {
      methods.push({ kind: 'facebook', linkedProviderUserId: linkedProviderUserId(entries, providerId) });
    }
  }

  if (isLinkedInDeterministicUid(context.uid) && context.linkedInReauthAvailable) {
    methods.push({ kind: 'linkedin' });
  }
  return methods;
}

/**
 * Resolve which reauthentication UX/path Delete Account should use first.
 *
 * Supported: password, google.com, apple.com, facebook.com, LinkedIn (same
 * deterministic UID). A LinkedIn account without a safe fresh session must
 * sign in again; other custom-token sessions stay unavailable.
 */
export function resolveDeletionReauthMethod(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry> | null | undefined,
  context: DeletionReauthContext = {},
): DeletionReauthMethod {
  const methods = resolveDeletionReauthMethods(providerData, context);
  if (methods.length > 0) return methods[0];

  if (isLinkedInDeterministicUid(context.uid)) {
    return { kind: 'unavailable', reason: 'linkedin_sign_in_again' };
  }
  if (listLinkedProviderIds(providerData).length === 0) {
    return { kind: 'unavailable', reason: 'custom_token_only' };
  }
  return { kind: 'unavailable', reason: 'no_supported_provider' };
}
