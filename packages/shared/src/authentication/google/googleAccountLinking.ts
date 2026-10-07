/**
 * Explicit Google account linking (ENH-AUTH-LINK-01, Android 2.0.8).
 * See docs/adr/0001-explicit-facebook-account-linking.md.
 *
 * Google binding of the provider-agnostic linking core: fresh native Google
 * ID token → GoogleAuthProvider credential → linkWithCredential on
 * currentUser, UID pinned before and after. No sign-in capability; Login and
 * Welcome keep using the sign-in use case.
 */
import {
  ACCOUNT_LINK_MESSAGE_PREFIX,
  createLinkProviderToCurrentUser,
  hasProviderLinked,
  readAccountLinkErrorCode,
  type AccountLinkErrorCode,
  type AccountLinkUserSnapshot,
  type ProviderTokenFailure,
} from '../accountLinking/accountLinkingCore.ts';

export const GOOGLE_FIREBASE_PROVIDER_ID = 'google.com';

const MESSAGE_KEYS: Record<AccountLinkErrorCode, string> = {
  NOT_AUTHENTICATED: `${ACCOUNT_LINK_MESSAGE_PREFIX}.sessionChanged`,
  USER_CHANGED: `${ACCOUNT_LINK_MESSAGE_PREFIX}.sessionChanged`,
  NOT_CONFIGURED: `${ACCOUNT_LINK_MESSAGE_PREFIX}.generic`,
  TOKEN_MISSING: `${ACCOUNT_LINK_MESSAGE_PREFIX}.generic`,
  CREDENTIAL_IN_USE: `${ACCOUNT_LINK_MESSAGE_PREFIX}.googleInUse`,
  EMAIL_IN_USE: `${ACCOUNT_LINK_MESSAGE_PREFIX}.googleInUse`,
  REQUIRES_RECENT_LOGIN: `${ACCOUNT_LINK_MESSAGE_PREFIX}.requiresRecentLogin`,
  NETWORK_ERROR: `${ACCOUNT_LINK_MESSAGE_PREFIX}.network`,
  UNKNOWN: `${ACCOUNT_LINK_MESSAGE_PREFIX}.generic`,
};

export function messageKeyForGoogleLinkError(code: AccountLinkErrorCode): string {
  return MESSAGE_KEYS[code];
}

export function hasGoogleLinked(
  snapshot: AccountLinkUserSnapshot | null | undefined,
): boolean {
  return hasProviderLinked(snapshot, GOOGLE_FIREBASE_PROVIDER_ID);
}

const NOT_CONFIGURED_CODES = new Set([
  'UNSUPPORTED_PLATFORM',
  'MISSING_WEB_CLIENT_ID',
  'NATIVE_MODULE_UNAVAILABLE',
  'PLAY_SERVICES_UNAVAILABLE',
  'CONFIGURATION_FAILED',
]);

function readMessages(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (current instanceof Error) parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' ');
}

/** Maps native Google Sign-In adapter failures (GoogleAuthFoundationError codes). */
export function classifyGoogleTokenFailure(err: unknown): ProviderTokenFailure {
  const code = readAccountLinkErrorCode(err);
  if (code === 'SIGN_IN_CANCELLED' || code === 'SIGN_IN_IN_PROGRESS') {
    return { kind: 'cancelled' };
  }
  if (code === 'MISSING_ID_TOKEN') {
    return { kind: 'failed', code: 'TOKEN_MISSING', diagnosticCode: code };
  }
  if (code && NOT_CONFIGURED_CODES.has(code)) {
    return { kind: 'failed', code: 'NOT_CONFIGURED', diagnosticCode: code };
  }
  if (/network|connection|internet/i.test(readMessages(err))) {
    return { kind: 'failed', code: 'NETWORK_ERROR', diagnosticCode: code ?? 'SDK_NETWORK' };
  }
  return { kind: 'failed', code: 'UNKNOWN', diagnosticCode: code ?? 'SDK_UNKNOWN' };
}

export type LinkGoogleToCurrentUserDeps = {
  getCurrentUser: () => AccountLinkUserSnapshot | null;
  /** Explicit confirmation shown before the Google account picker. */
  confirm: () => Promise<boolean>;
  isConfigured: () => boolean;
  /** Interactive account picker; must drop any previous Google session first. */
  requestIdToken: () => Promise<{ idToken?: string | null }>;
  /** linkWithCredential on currentUser; rejects if currentUser ≠ expectedUid. */
  linkWithIdToken: (
    idToken: string,
    expectedUid: string,
  ) => Promise<AccountLinkUserSnapshot>;
  reloadCurrentUser: () => Promise<AccountLinkUserSnapshot | null>;
  /** Drops the temporary native Google session (idempotent). */
  discardProviderSession: () => void | Promise<void>;
};

export function createLinkGoogleToCurrentUser(deps: LinkGoogleToCurrentUserDeps) {
  return createLinkProviderToCurrentUser({
    providerId: GOOGLE_FIREBASE_PROVIDER_ID,
    logTag: '[linkGoogleToCurrentUser]',
    getCurrentUser: deps.getCurrentUser,
    confirm: deps.confirm,
    isConfigured: deps.isConfigured,
    requestToken: async () => (await deps.requestIdToken())?.idToken,
    classifyTokenFailure: classifyGoogleTokenFailure,
    linkWithToken: deps.linkWithIdToken,
    reloadCurrentUser: deps.reloadCurrentUser,
    discardProviderSession: deps.discardProviderSession,
  });
}
