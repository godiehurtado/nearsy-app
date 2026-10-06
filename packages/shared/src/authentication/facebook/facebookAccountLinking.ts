/**
 * Explicit Facebook account linking (ENH-AUTH-LINK-01, Android 2.0.8).
 * See docs/adr/0001-explicit-facebook-account-linking.md.
 *
 * Only entry point: More → Sign-in methods, for the signed-in Nearsy user.
 * Fresh native Facebook token → FacebookAuthProvider credential →
 * linkWithCredential on currentUser, with the UID pinned before and after.
 *
 * Pure module: no Facebook SDK / RNFirebase imports so Node tests inject deps.
 * The deps contract has no sign-in capability. Never logs, returns or persists
 * the access token, emails or UIDs. No email heuristics, no pending credential,
 * no merge and no unlink.
 */
import {
  FACEBOOK_FIREBASE_PROVIDER_ID,
  FacebookAuthenticationError,
  mapFacebookSdkFailure,
  type FacebookAccessTokenResult,
} from './facebookAuthCore.ts';

export type FacebookLinkUserSnapshot = {
  uid: string;
  providerIds: readonly string[];
};

export type FacebookLinkErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'USER_CHANGED'
  | 'NOT_CONFIGURED'
  | 'TOKEN_MISSING'
  | 'CREDENTIAL_IN_USE'
  | 'EMAIL_IN_USE'
  | 'REQUIRES_RECENT_LOGIN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type FacebookLinkOutcome =
  | { status: 'linked'; providerIds: readonly string[] }
  | { status: 'alreadyLinked'; providerIds: readonly string[] }
  | { status: 'cancelled' }
  | { status: 'ignored' }
  | { status: 'failed'; code: FacebookLinkErrorCode; diagnosticCode?: string };

/** Sanitized adapter error code when currentUser changed before linking. */
export const FACEBOOK_LINK_USER_CHANGED_CODE = 'nearsy/link-user-changed';

const MESSAGE_PREFIX = 'settings.signInMethods.errors';

const MESSAGE_KEYS: Record<FacebookLinkErrorCode, string> = {
  NOT_AUTHENTICATED: `${MESSAGE_PREFIX}.sessionChanged`,
  USER_CHANGED: `${MESSAGE_PREFIX}.sessionChanged`,
  NOT_CONFIGURED: `${MESSAGE_PREFIX}.generic`,
  TOKEN_MISSING: `${MESSAGE_PREFIX}.generic`,
  CREDENTIAL_IN_USE: `${MESSAGE_PREFIX}.credentialInUse`,
  EMAIL_IN_USE: `${MESSAGE_PREFIX}.emailInUse`,
  REQUIRES_RECENT_LOGIN: `${MESSAGE_PREFIX}.requiresRecentLogin`,
  NETWORK_ERROR: `${MESSAGE_PREFIX}.network`,
  UNKNOWN: `${MESSAGE_PREFIX}.generic`,
};

export function messageKeyForFacebookLinkError(
  code: FacebookLinkErrorCode,
): string {
  return MESSAGE_KEYS[code];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readCode(err: unknown): string | undefined {
  const code = readRecord(err)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Firebase `user` → UID + provider ids only (no email, name or tokens). */
export function toFacebookLinkUserSnapshot(
  user:
    | {
        uid?: string | null;
        providerData?: ReadonlyArray<{ providerId?: string | null } | null> | null;
      }
    | null
    | undefined,
): FacebookLinkUserSnapshot | null {
  const uid = typeof user?.uid === 'string' ? user.uid : '';
  if (!uid) return null;
  const providerIds = (user?.providerData ?? [])
    .map((entry) => entry?.providerId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return { uid, providerIds };
}

export function hasFacebookLinked(
  snapshot: FacebookLinkUserSnapshot | null | undefined,
): boolean {
  return (snapshot?.providerIds ?? []).includes(FACEBOOK_FIREBASE_PROVIDER_ID);
}

export function mapFacebookLinkFailure(err: unknown): {
  code: FacebookLinkErrorCode;
  diagnosticCode?: string;
} {
  const code = readCode(err);
  switch (code) {
    case 'auth/credential-already-in-use':
      return { code: 'CREDENTIAL_IN_USE', diagnosticCode: code };
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return { code: 'EMAIL_IN_USE', diagnosticCode: code };
    case 'auth/requires-recent-login':
      return { code: 'REQUIRES_RECENT_LOGIN', diagnosticCode: code };
    case 'auth/network-request-failed':
      return { code: 'NETWORK_ERROR', diagnosticCode: code };
    case 'auth/no-current-user':
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
    case 'auth/user-not-found':
    case 'auth/user-disabled':
      return { code: 'NOT_AUTHENTICATED', diagnosticCode: code };
    case 'auth/user-mismatch':
    case FACEBOOK_LINK_USER_CHANGED_CODE:
      return { code: 'USER_CHANGED', diagnosticCode: code };
    case 'auth/operation-not-allowed':
      return { code: 'NOT_CONFIGURED', diagnosticCode: code };
    default:
      return { code: 'UNKNOWN', diagnosticCode: code ?? 'LINK_UNKNOWN' };
  }
}

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

function logDev(outcome: FacebookLinkOutcome): void {
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    outcome.status === 'failed'
  ) {
    console.log('[linkFacebookToCurrentUser]', {
      code: outcome.code,
      diagnosticCode: outcome.diagnosticCode,
    });
  }
}

function failed(
  code: FacebookLinkErrorCode,
  diagnosticCode?: string,
): FacebookLinkOutcome {
  return { status: 'failed', code, ...(diagnosticCode ? { diagnosticCode } : {}) };
}

async function safeReload(
  deps: LinkFacebookToCurrentUserDeps,
): Promise<FacebookLinkUserSnapshot | null> {
  try {
    return await deps.reloadCurrentUser();
  } catch {
    return null;
  }
}

export function createLinkFacebookToCurrentUser(
  deps: LinkFacebookToCurrentUserDeps,
) {
  let inProgress = false;

  async function run(): Promise<FacebookLinkOutcome> {
    const initial = deps.getCurrentUser();
    if (!initial) return failed('NOT_AUTHENTICATED', 'NO_CURRENT_USER');
    const initialUid = initial.uid;

    if (hasFacebookLinked(initial)) {
      return { status: 'alreadyLinked', providerIds: initial.providerIds };
    }
    if (!deps.isConfigured()) {
      return failed('NOT_CONFIGURED', 'APP_CONFIG_MISSING');
    }
    if (!(await deps.confirm())) return { status: 'cancelled' };

    let accessToken = '';
    try {
      try {
        const result = await deps.requestAccessToken();
        accessToken = result?.accessToken?.trim() ?? '';
      } catch (err) {
        const mapped = mapFacebookSdkFailure(err);
        if (mapped.code === 'CANCELLED') return { status: 'cancelled' };
        return failed(
          mapped.code === 'NETWORK_ERROR' ? 'NETWORK_ERROR' : 'UNKNOWN',
          mapped.diagnosticCode,
        );
      }
      if (!accessToken) return failed('TOKEN_MISSING', 'ACCESS_TOKEN_MISSING');

      const beforeLink = deps.getCurrentUser();
      if (!beforeLink) return failed('NOT_AUTHENTICATED', 'NO_CURRENT_USER');
      if (beforeLink.uid !== initialUid) {
        return failed('USER_CHANGED', FACEBOOK_LINK_USER_CHANGED_CODE);
      }

      let linked: FacebookLinkUserSnapshot;
      try {
        linked = await deps.linkWithAccessToken(accessToken, initialUid);
      } catch (err) {
        if (readCode(err) === 'auth/provider-already-linked') {
          const current = await safeReload(deps);
          if (current?.uid === initialUid && hasFacebookLinked(current)) {
            return { status: 'alreadyLinked', providerIds: current.providerIds };
          }
          return failed('UNKNOWN', 'auth/provider-already-linked');
        }
        const mapped = mapFacebookLinkFailure(err);
        return failed(mapped.code, mapped.diagnosticCode);
      }

      if (linked.uid !== initialUid) {
        return failed('USER_CHANGED', 'LINK_UID_MISMATCH');
      }

      const reloaded = await safeReload(deps);
      const final =
        reloaded && reloaded.uid === initialUid && hasFacebookLinked(reloaded)
          ? reloaded
          : linked;
      return { status: 'linked', providerIds: final.providerIds };
    } finally {
      try {
        await deps.discardProviderSession();
      } catch {
        // Idempotent best effort; never masks the outcome.
      }
    }
  }

  return async function linkFacebookToCurrentUser(): Promise<FacebookLinkOutcome> {
    if (inProgress) return { status: 'ignored' };
    inProgress = true;
    try {
      const outcome = await run();
      logDev(outcome);
      return outcome;
    } catch (err) {
      const mapped =
        err instanceof FacebookAuthenticationError
          ? { code: 'UNKNOWN' as const, diagnosticCode: err.diagnosticCode }
          : mapFacebookLinkFailure(err);
      const outcome = failed(mapped.code, mapped.diagnosticCode);
      logDev(outcome);
      return outcome;
    } finally {
      inProgress = false;
    }
  };
}
