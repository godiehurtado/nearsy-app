/**
 * Explicit Facebook account linking (ENH-AUTH-LINK-01, Android 2.0.8).
 * See docs/adr/0001-explicit-facebook-account-linking.md.
 *
 * Facebook binding of the provider-agnostic linking core: fresh native
 * Facebook access token → FacebookAuthProvider credential → linkWithCredential
 * on currentUser, UID pinned before and after. No sign-in capability.
 */
import {
  ACCOUNT_LINK_MESSAGE_PREFIX,
  ACCOUNT_LINK_USER_CHANGED_CODE,
  createLinkProviderToCurrentUser,
  hasProviderLinked,
  mapAccountLinkFailure,
  toAccountLinkUserSnapshot,
  type AccountLinkErrorCode,
  type AccountLinkOutcome,
  type AccountLinkUserSnapshot,
} from '../accountLinking/accountLinkingCore.ts';
import {
  FACEBOOK_FIREBASE_PROVIDER_ID,
  mapFacebookSdkFailure,
  type FacebookAccessTokenResult,
} from './facebookAuthCore.ts';

export type FacebookLinkUserSnapshot = AccountLinkUserSnapshot;
export type FacebookLinkErrorCode = AccountLinkErrorCode;
export type FacebookLinkOutcome = AccountLinkOutcome;

export const FACEBOOK_LINK_USER_CHANGED_CODE = ACCOUNT_LINK_USER_CHANGED_CODE;

const MESSAGE_KEYS: Record<FacebookLinkErrorCode, string> = {
  NOT_AUTHENTICATED: `${ACCOUNT_LINK_MESSAGE_PREFIX}.sessionChanged`,
  USER_CHANGED: `${ACCOUNT_LINK_MESSAGE_PREFIX}.sessionChanged`,
  NOT_CONFIGURED: `${ACCOUNT_LINK_MESSAGE_PREFIX}.generic`,
  TOKEN_MISSING: `${ACCOUNT_LINK_MESSAGE_PREFIX}.generic`,
  CREDENTIAL_IN_USE: `${ACCOUNT_LINK_MESSAGE_PREFIX}.credentialInUse`,
  EMAIL_IN_USE: `${ACCOUNT_LINK_MESSAGE_PREFIX}.emailInUse`,
  REQUIRES_RECENT_LOGIN: `${ACCOUNT_LINK_MESSAGE_PREFIX}.requiresRecentLogin`,
  NETWORK_ERROR: `${ACCOUNT_LINK_MESSAGE_PREFIX}.network`,
  UNKNOWN: `${ACCOUNT_LINK_MESSAGE_PREFIX}.generic`,
};

export function messageKeyForFacebookLinkError(
  code: FacebookLinkErrorCode,
): string {
  return MESSAGE_KEYS[code];
}

export const toFacebookLinkUserSnapshot = toAccountLinkUserSnapshot;

export function hasFacebookLinked(
  snapshot: FacebookLinkUserSnapshot | null | undefined,
): boolean {
  return hasProviderLinked(snapshot, FACEBOOK_FIREBASE_PROVIDER_ID);
}

export const mapFacebookLinkFailure = mapAccountLinkFailure;

export type LinkFacebookToCurrentUserDeps = {
  getCurrentUser: () => FacebookLinkUserSnapshot | null;
  /** Explicit confirmation shown before any Facebook interaction. */
  confirm: () => Promise<boolean>;
  isConfigured: () => boolean;
  /** Interactive native login; must drop any previous session first. */
  requestAccessToken: () => Promise<FacebookAccessTokenResult>;
  /** linkWithCredential on currentUser; rejects if currentUser ≠ expectedUid. */
  linkWithAccessToken: (
    accessToken: string,
    expectedUid: string,
  ) => Promise<FacebookLinkUserSnapshot>;
  reloadCurrentUser: () => Promise<FacebookLinkUserSnapshot | null>;
  /** Drops the temporary native Facebook session (idempotent). */
  discardProviderSession: () => void | Promise<void>;
};

export function createLinkFacebookToCurrentUser(
  deps: LinkFacebookToCurrentUserDeps,
) {
  return createLinkProviderToCurrentUser({
    providerId: FACEBOOK_FIREBASE_PROVIDER_ID,
    logTag: '[linkFacebookToCurrentUser]',
    getCurrentUser: deps.getCurrentUser,
    confirm: deps.confirm,
    isConfigured: deps.isConfigured,
    requestToken: async () => (await deps.requestAccessToken())?.accessToken,
    classifyTokenFailure: (err) => {
      const mapped = mapFacebookSdkFailure(err);
      if (mapped.code === 'CANCELLED') return { kind: 'cancelled' };
      return {
        kind: 'failed',
        code: mapped.code === 'NETWORK_ERROR' ? 'NETWORK_ERROR' : 'UNKNOWN',
        diagnosticCode: mapped.diagnosticCode,
      };
    },
    linkWithToken: deps.linkWithAccessToken,
    reloadCurrentUser: deps.reloadCurrentUser,
    discardProviderSession: deps.discardProviderSession,
  });
}
