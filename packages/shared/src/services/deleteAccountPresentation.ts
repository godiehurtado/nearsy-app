/**
 * Pure presentation rules for Delete Account (iOS).
 * Methods come only from Firebase `providerData` (never from the email);
 * LinkedIn is never a selectable method (see linkedInDeletionPolicy).
 */
import type { AccountDeletionRequest } from './accountDeletion';
import {
  FIREBASE_PROVIDER_APPLE,
  FIREBASE_PROVIDER_FACEBOOK,
  FIREBASE_PROVIDER_GOOGLE,
  FIREBASE_PROVIDER_PASSWORD,
  listLinkedProviderIds,
  resolveDeletionReauthMethod,
  resolveDeletionReauthMethods,
  type AvailableDeletionReauthMethod,
  type DeletionReauthMethod,
  type FirebaseAuthProviderDataEntry,
} from './deletionReauth/deletionReauthMethod';
import {
  LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY,
  isLinkedInDeterministicUid,
} from './deletionReauth/linkedInDeletionPolicy';

export const DELETE_CONFIRMATION_WORD = 'DELETE';

/** Exact, case-sensitive match; only surrounding whitespace is forgiven. */
export function isDeleteConfirmationText(input: string): boolean {
  return input.trim() === DELETE_CONFIRMATION_WORD;
}

export type DeleteAccountMethodKind = AvailableDeletionReauthMethod['kind'];

export const DELETE_METHOD_LABEL_KEY: Record<DeleteAccountMethodKind, string> = {
  password: 'settings.deleteAccount.methodPassword',
  google: 'settings.deleteAccount.methodGoogle',
  apple: 'settings.deleteAccount.methodApple',
  facebook: 'settings.deleteAccount.methodFacebook',
};

export const DELETE_METHOD_ACTION_KEY: Record<DeleteAccountMethodKind, string> = {
  password: 'settings.deleteAccount.reauthConfirm',
  google: 'settings.deleteAccount.reauthContinueGoogle',
  apple: 'settings.deleteAccount.reauthContinueApple',
  facebook: 'settings.deleteAccount.reauthContinueFacebook',
};

export type DeleteAccountOptions = {
  /** Every credential-based method linked to this account, in priority order. */
  methods: AvailableDeletionReauthMethod[];
  /** First method, or why none is available. */
  primary: DeletionReauthMethod;
  /** No safe method: only a recent session can delete (LinkedIn-only, custom token). */
  recentSessionOnly: boolean;
};

export function buildDeleteAccountOptions(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry> | null | undefined,
  uid: string | null | undefined,
): DeleteAccountOptions {
  const methods = resolveDeletionReauthMethods(providerData);
  return {
    methods,
    primary: resolveDeletionReauthMethod(providerData, { uid: uid ?? null }),
    recentSessionOnly: methods.length === 0,
  };
}

/** Keeps the current choice while it is still linked; otherwise the first method. */
export function pickSelectedMethod(
  options: DeleteAccountOptions,
  current: DeleteAccountMethodKind | null,
): AvailableDeletionReauthMethod | null {
  return options.methods.find((m) => m.kind === current) ?? options.methods[0] ?? null;
}

export function canSubmitDeletion(input: {
  typed: string;
  method: AvailableDeletionReauthMethod | null;
  password: string;
}): boolean {
  if (!isDeleteConfirmationText(input.typed)) return false;
  if (input.method?.kind === 'password') return input.password.trim().length > 0;
  return true;
}

/**
 * The selected method is the only one used to reauthenticate.
 * A typed password is always verified; Google / Apple / Facebook are skipped
 * while the session is still recent, unless the backend already said otherwise.
 */
export function buildDeletionRequest(
  method: AvailableDeletionReauthMethod | null,
  password: string,
  forceReauth: boolean,
): AccountDeletionRequest {
  if (!method) return {};
  if (method.kind === 'password') return { reauth: { method, password } };
  return { reauth: { method }, reauthOnlyIfStale: !forceReauth };
}

/** Guidance for accounts without a safe method once their session is not recent. */
export function resolveSessionGuidanceKey(options: DeleteAccountOptions): string {
  return options.primary.kind === 'unavailable' && options.primary.reason === 'linkedin_sign_in_again'
    ? LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY
    : 'settings.deleteAccount.reauthUnavailable';
}

export type DeletionReauthProviderSummary = {
  passwordPresent: boolean;
  googlePresent: boolean;
  applePresent: boolean;
  facebookPresent: boolean;
  linkedinDeterministicUid: boolean;
  safeMethodCount: number;
};

/** Booleans only: no UID, email, name or provider user IDs. */
export function summarizeDeletionReauthProviders(
  providerData: ReadonlyArray<FirebaseAuthProviderDataEntry> | null | undefined,
  uid: string | null | undefined,
): DeletionReauthProviderSummary {
  const ids = listLinkedProviderIds(providerData);
  return {
    passwordPresent: ids.includes(FIREBASE_PROVIDER_PASSWORD),
    googlePresent: ids.includes(FIREBASE_PROVIDER_GOOGLE),
    applePresent: ids.includes(FIREBASE_PROVIDER_APPLE),
    facebookPresent: ids.includes(FIREBASE_PROVIDER_FACEBOOK),
    linkedinDeterministicUid: isLinkedInDeterministicUid(uid),
    safeMethodCount: resolveDeletionReauthMethods(providerData).length,
  };
}

/** Development-only trace of the resolved methods (booleans and a count). */
export function traceDeletionReauthProviders(summary: DeletionReauthProviderSummary): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  // eslint-disable-next-line no-console
  console.log('[deleteAccountMethods]', JSON.stringify(summary));
}
