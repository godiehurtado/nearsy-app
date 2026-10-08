/**
 * Explicit provider linking to the signed-in Nearsy user (ENH-AUTH-LINK-01).
 * See docs/adr/0001-explicit-facebook-account-linking.md.
 *
 * Only entry point: More → Sign-in methods. Fresh provider token →
 * provider credential → linkWithCredential on currentUser, with the UID
 * pinned before and after.
 *
 * Pure module: no SDK / RNFirebase imports so Node tests inject deps.
 * The deps contract has no sign-in capability. Never logs, returns or persists
 * tokens, emails or UIDs. No email heuristics, no pending credential, no merge
 * and no unlink.
 */

export type AccountLinkUserSnapshot = {
  uid: string;
  providerIds: readonly string[];
};

export type AccountLinkErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'USER_CHANGED'
  | 'NOT_CONFIGURED'
  | 'TOKEN_MISSING'
  | 'CREDENTIAL_IN_USE'
  | 'EMAIL_IN_USE'
  | 'REQUIRES_RECENT_LOGIN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type AccountLinkOutcome =
  | { status: 'linked'; providerIds: readonly string[] }
  | { status: 'alreadyLinked'; providerIds: readonly string[] }
  | { status: 'cancelled' }
  | { status: 'ignored' }
  | { status: 'failed'; code: AccountLinkErrorCode; diagnosticCode?: string };

/** Sanitized adapter error code when currentUser changed before linking. */
export const ACCOUNT_LINK_USER_CHANGED_CODE = 'nearsy/link-user-changed';

export const ACCOUNT_LINK_MESSAGE_PREFIX = 'settings.signInMethods.errors';

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readAccountLinkErrorCode(err: unknown): string | undefined {
  const code = readRecord(err)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Firebase `user` → UID + provider ids only (no email, name or tokens). */
export function toAccountLinkUserSnapshot(
  user:
    | {
        uid?: string | null;
        providerData?: ReadonlyArray<{ providerId?: string | null } | null> | null;
      }
    | null
    | undefined,
): AccountLinkUserSnapshot | null {
  const uid = typeof user?.uid === 'string' ? user.uid : '';
  if (!uid) return null;
  const providerIds = (user?.providerData ?? [])
    .map((entry) => entry?.providerId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return { uid, providerIds };
}

export function hasProviderLinked(
  snapshot: AccountLinkUserSnapshot | null | undefined,
  providerId: string,
): boolean {
  return (snapshot?.providerIds ?? []).includes(providerId);
}

export function mapAccountLinkFailure(err: unknown): {
  code: AccountLinkErrorCode;
  diagnosticCode?: string;
} {
  const code = readAccountLinkErrorCode(err);
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
    case ACCOUNT_LINK_USER_CHANGED_CODE:
      return { code: 'USER_CHANGED', diagnosticCode: code };
    case 'auth/operation-not-allowed':
      return { code: 'NOT_CONFIGURED', diagnosticCode: code };
    default:
      return { code: 'UNKNOWN', diagnosticCode: code ?? 'LINK_UNKNOWN' };
  }
}

/** How the provider SDK failure should end the attempt. */
export type ProviderTokenFailure =
  | { kind: 'cancelled' }
  | {
      kind: 'failed';
      code: 'NETWORK_ERROR' | 'NOT_CONFIGURED' | 'TOKEN_MISSING' | 'UNKNOWN';
      diagnosticCode?: string;
    };

export type LinkProviderToCurrentUserDeps = {
  /** Firebase provider id, e.g. `google.com`. */
  providerId: string;
  /** Dev log tag; logs carry only outcome codes. */
  logTag: string;
  getCurrentUser: () => AccountLinkUserSnapshot | null;
  /** Explicit confirmation shown before any provider interaction. */
  confirm: () => Promise<boolean>;
  isConfigured: () => boolean;
  /** Interactive native login; must drop any previous provider session first. */
  requestToken: () => Promise<string | null | undefined>;
  classifyTokenFailure: (err: unknown) => ProviderTokenFailure;
  /** linkWithCredential on currentUser; rejects if currentUser ≠ expectedUid. */
  linkWithToken: (
    token: string,
    expectedUid: string,
  ) => Promise<AccountLinkUserSnapshot>;
  reloadCurrentUser: () => Promise<AccountLinkUserSnapshot | null>;
  /** Drops the temporary native provider session (idempotent). */
  discardProviderSession: () => void | Promise<void>;
};

function failed(
  code: AccountLinkErrorCode,
  diagnosticCode?: string,
): AccountLinkOutcome {
  return { status: 'failed', code, ...(diagnosticCode ? { diagnosticCode } : {}) };
}

export function createLinkProviderToCurrentUser(
  deps: LinkProviderToCurrentUserDeps,
) {
  const { providerId } = deps;
  let inProgress = false;

  function logDev(outcome: AccountLinkOutcome): void {
    if (
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      outcome.status === 'failed'
    ) {
      console.log(deps.logTag, {
        code: outcome.code,
        diagnosticCode: outcome.diagnosticCode,
      });
    }
  }

  async function safeReload(): Promise<AccountLinkUserSnapshot | null> {
    try {
      return await deps.reloadCurrentUser();
    } catch {
      return null;
    }
  }

  async function run(): Promise<AccountLinkOutcome> {
    const initial = deps.getCurrentUser();
    if (!initial) return failed('NOT_AUTHENTICATED', 'NO_CURRENT_USER');
    const initialUid = initial.uid;

    if (hasProviderLinked(initial, providerId)) {
      return { status: 'alreadyLinked', providerIds: initial.providerIds };
    }
    if (!deps.isConfigured()) {
      return failed('NOT_CONFIGURED', 'APP_CONFIG_MISSING');
    }
    if (!(await deps.confirm())) return { status: 'cancelled' };

    try {
      let token = '';
      try {
        token = (await deps.requestToken())?.trim() ?? '';
      } catch (err) {
        const failure = deps.classifyTokenFailure(err);
        if (failure.kind === 'cancelled') return { status: 'cancelled' };
        return failed(failure.code, failure.diagnosticCode);
      }
      if (!token) return failed('TOKEN_MISSING', 'TOKEN_MISSING');

      const beforeLink = deps.getCurrentUser();
      if (!beforeLink) return failed('NOT_AUTHENTICATED', 'NO_CURRENT_USER');
      if (beforeLink.uid !== initialUid) {
        return failed('USER_CHANGED', ACCOUNT_LINK_USER_CHANGED_CODE);
      }

      let linked: AccountLinkUserSnapshot;
      try {
        linked = await deps.linkWithToken(token, initialUid);
      } catch (err) {
        if (readAccountLinkErrorCode(err) === 'auth/provider-already-linked') {
          const current = await safeReload();
          if (current?.uid === initialUid && hasProviderLinked(current, providerId)) {
            return { status: 'alreadyLinked', providerIds: current.providerIds };
          }
          return failed('UNKNOWN', 'auth/provider-already-linked');
        }
        const mapped = mapAccountLinkFailure(err);
        return failed(mapped.code, mapped.diagnosticCode);
      }

      if (linked.uid !== initialUid) {
        return failed('USER_CHANGED', 'LINK_UID_MISMATCH');
      }

      const reloaded = await safeReload();
      const final =
        reloaded &&
        reloaded.uid === initialUid &&
        hasProviderLinked(reloaded, providerId)
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

  return async function linkProviderToCurrentUser(): Promise<AccountLinkOutcome> {
    if (inProgress) return { status: 'ignored' };
    inProgress = true;
    try {
      const outcome = await run();
      logDev(outcome);
      return outcome;
    } catch (err) {
      const mapped = mapAccountLinkFailure(err);
      const outcome = failed(mapped.code, mapped.diagnosticCode);
      logDev(outcome);
      return outcome;
    } finally {
      inProgress = false;
    }
  };
}

/** Screen-wide lock: one linking attempt at a time, across all providers. */
export function createExclusiveLinkRunner<P extends string>() {
  let active: P | null = null;
  return {
    activeProvider: (): P | null => active,
    async run(
      provider: P,
      task: () => Promise<AccountLinkOutcome>,
    ): Promise<AccountLinkOutcome> {
      if (active) return { status: 'ignored' };
      active = provider;
      try {
        return await task();
      } finally {
        active = null;
      }
    },
  };
}
