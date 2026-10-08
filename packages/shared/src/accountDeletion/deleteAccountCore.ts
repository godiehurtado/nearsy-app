/**
 * Android Delete Account (BUG-DEL-01 client).
 *
 * The backend callable `deleteMyAccount` is the only deletion path: it removes
 * every owner datum first and the Auth user last, and rejects sign-ins older
 * than five minutes (`RECENT_LOGIN_REQUIRED`). The client never deletes the
 * Auth user, Firestore documents or Storage objects itself.
 *
 * Reauthentication methods — only providers actually linked, never inferred
 * from email:
 * - password → `password` in providerData (the person types the password)
 * - google   → `google.com` in providerData
 * - facebook → `facebook.com` in providerData
 * Display priority is password, Google, Facebook; the person picks any listed
 * method and the UID must be unchanged afterwards.
 *
 * LinkedIn (`li_` UID; custom-token accounts never appear in providerData) has
 * no AuthCredential usable with `reauthenticateWithCredential`, so it is never
 * reauthenticated here. When LinkedIn is the only detectable method, the
 * `recent_session` attempt calls the backend with the current session and the
 * backend decides whether `auth_time` is recent enough; otherwise the person
 * is told to sign out, sign back in with LinkedIn and retry within 5 minutes.
 */

import {
  runContractualAndroidLogout,
  type ContractualLogoutDeps,
} from '../location/contractualLogout.ts';
import { LINKEDIN_FIREBASE_UID_PATTERN } from '../authentication/signInMethods.ts';
import type { AccountDeletionExitBarrier } from './accountDeletionExit.ts';

export const DELETE_MY_ACCOUNT_CALLABLE = 'deleteMyAccount';

export type DeleteAccountMethod = 'password' | 'google' | 'facebook';

export type DeleteAccountAttemptMethod = DeleteAccountMethod | 'recent_session';

export type DeleteAccountUserSnapshot =
  | {
      uid?: string | null;
      providerIds?: ReadonlyArray<string | null | undefined>;
    }
  | null
  | undefined;

const METHOD_ORDER: ReadonlyArray<DeleteAccountMethod> = [
  'password',
  'google',
  'facebook',
];

const PROVIDER_ID_BY_METHOD: Record<DeleteAccountMethod, string> = {
  password: 'password',
  google: 'google.com',
  facebook: 'facebook.com',
};

/** Linked providers that support `reauthenticateWithCredential`. */
export function resolveDeleteAccountMethods(
  user: DeleteAccountUserSnapshot,
): DeleteAccountMethod[] {
  const providerIds = new Set(
    (user?.providerIds ?? []).filter(
      (id): id is string => typeof id === 'string',
    ),
  );
  return METHOD_ORDER.filter((method) =>
    providerIds.has(PROVIDER_ID_BY_METHOD[method]),
  );
}

export function isLinkedInAccount(user: DeleteAccountUserSnapshot): boolean {
  const uid = typeof user?.uid === 'string' ? user.uid : '';
  return LINKEDIN_FIREBASE_UID_PATTERN.test(uid);
}

/** LinkedIn is linked and no reauthenticable provider is. */
export function isLinkedInOnlyAccount(user: DeleteAccountUserSnapshot): boolean {
  return isLinkedInAccount(user) && resolveDeleteAccountMethods(user).length === 0;
}

export type DeleteAccountProviderAvailability = {
  google: boolean;
  facebook: boolean;
};

export type DeleteAccountOptions = {
  methods: DeleteAccountMethod[];
  /** LinkedIn-only account: delete with the current session (backend checks auth_time). */
  recentSessionOnly: boolean;
};

export function resolveDeleteAccountOptions(
  user: DeleteAccountUserSnapshot,
  availability: DeleteAccountProviderAvailability,
): DeleteAccountOptions {
  return {
    methods: resolveDeleteAccountMethods(user).filter(
      (method) => method === 'password' || availability[method],
    ),
    recentSessionOnly: isLinkedInOnlyAccount(user),
  };
}

export type DeleteAccountReauthErrorCode =
  | 'CANCELLED'
  | 'IN_PROGRESS'
  | 'USER_MISMATCH'
  | 'NETWORK'
  | 'FAILED';

export class DeleteAccountReauthError extends Error {
  readonly code: DeleteAccountReauthErrorCode;

  constructor(code: DeleteAccountReauthErrorCode, message: string) {
    super(message);
    this.name = 'DeleteAccountReauthError';
    this.code = code;
  }
}

export type DeleteAccountFailureKind =
  | 'reauth_cancelled'
  | 'reauth_mismatch'
  | 'reauth_network'
  | 'wrong_password'
  | 'reauth_failed'
  | 'linkedin_guidance'
  | 'method_unavailable'
  | 'uid_changed'
  | 'stale_session'
  | 'app_check'
  | 'unauthenticated'
  | 'retryable'
  | 'partial'
  | 'user_not_found'
  | 'network'
  | 'unknown';

const MESSAGE_KEY_BY_KIND: Record<DeleteAccountFailureKind, string> = {
  reauth_cancelled: 'settings.deleteAccount.reauthCancelled',
  reauth_mismatch: 'settings.deleteAccount.reauthMismatch',
  reauth_network: 'settings.deleteAccount.networkError',
  wrong_password: 'settings.deleteAccount.reauthError',
  reauth_failed: 'settings.deleteAccount.reauthFailed',
  linkedin_guidance: 'settings.deleteAccount.linkedInGuidance',
  method_unavailable: 'settings.deleteAccount.reauthUnavailable',
  uid_changed: 'settings.deleteAccount.reauthMismatch',
  stale_session: 'settings.deleteAccount.errorStaleSession',
  app_check: 'settings.deleteAccount.errorAppCheck',
  unauthenticated: 'settings.deleteAccount.errorUnauthenticated',
  retryable: 'settings.deleteAccount.errorRetryable',
  partial: 'settings.deleteAccount.errorPartial',
  user_not_found: 'settings.deleteAccount.errorUserNotFound',
  network: 'settings.deleteAccount.errorNetwork',
  unknown: 'settings.deleteAccount.errorUnknown',
};

export function deleteAccountMessageKey(kind: DeleteAccountFailureKind): string {
  return MESSAGE_KEY_BY_KIND[kind];
}

function readCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

function readReason(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const details = (err as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return '';
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : '';
}

function normalizeFunctionsCode(code: string): string {
  return code.replace(/^functions\//, '').toLowerCase().replace(/_/g, '-');
}

const ACCOUNT_GONE_AUTH_CODES = new Set([
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/user-token-expired',
]);

/**
 * Reauthentication failures (before the callable runs). `in_progress` means
 * another provider flow is already open and the attempt is silently dropped.
 */
export function mapDeleteAccountReauthFailure(
  err: unknown,
  method: DeleteAccountMethod,
): DeleteAccountFailureKind | 'in_progress' {
  const code = readCode(err);
  switch (code) {
    case 'CANCELLED':
      return 'reauth_cancelled';
    case 'IN_PROGRESS':
    case 'OPERATION_IN_PROGRESS':
      return 'in_progress';
    case 'USER_MISMATCH':
    case 'auth/user-mismatch':
      return 'reauth_mismatch';
    case 'NETWORK':
    case 'NETWORK_ERROR':
    case 'auth/network-request-failed':
      return 'reauth_network';
    case 'NOT_CONFIGURED':
      return 'method_unavailable';
    case 'USER_DISABLED':
      return 'user_not_found';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return method === 'password' ? 'wrong_password' : 'reauth_failed';
    default:
      break;
  }
  if (ACCOUNT_GONE_AUTH_CODES.has(code)) return 'user_not_found';
  return 'reauth_failed';
}

/** `deleteMyAccount` failures: `details.reason` first, transport code second. */
export function mapDeleteMyAccountFailure(err: unknown): DeleteAccountFailureKind {
  switch (readReason(err)) {
    case 'RECENT_LOGIN_REQUIRED':
      return 'stale_session';
    case 'APP_CHECK_REQUIRED':
      return 'app_check';
    case 'UNAUTHENTICATED':
      return 'unauthenticated';
    case 'DELETION_RETRYABLE':
      return 'retryable';
    case 'DELETION_FAILED':
      return 'partial';
    default:
      break;
  }
  const raw = readCode(err);
  if (ACCOUNT_GONE_AUTH_CODES.has(raw)) return 'user_not_found';
  if (raw === 'auth/network-request-failed') return 'network';
  if (raw === 'auth/requires-recent-login') return 'stale_session';
  switch (normalizeFunctionsCode(raw)) {
    case 'unauthenticated':
      return 'unauthenticated';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'network';
    default:
      return 'unknown';
  }
}

export type DeleteMyAccountStatus = 'DELETED' | 'ALREADY_DELETED';

/** Only an explicit `{ ok: true, status }` from the backend confirms deletion. */
export function readConfirmedDeletion(data: unknown): DeleteMyAccountStatus | null {
  if (!data || typeof data !== 'object') return null;
  const { ok, status } = data as { ok?: unknown; status?: unknown };
  if (ok !== true) return null;
  return status === 'DELETED' || status === 'ALREADY_DELETED' ? status : null;
}

export type DeleteAccountRequest = {
  method: DeleteAccountAttemptMethod;
  password?: string;
};

export type DeleteAccountOutcome =
  | { status: 'deleted'; alreadyDeleted: boolean }
  | { status: 'in_progress' }
  | { status: 'failed'; kind: DeleteAccountFailureKind; messageKey: string };

export type DeleteAccountDevLog = {
  stage: 'reauth' | 'callable' | 'response' | 'cleanup';
  kind?: DeleteAccountFailureKind;
  code?: string;
  reason?: string;
};

export type DeleteAccountFlowDeps = {
  getCurrentUser: () => DeleteAccountUserSnapshot;
  reauthenticate: Partial<
    Record<DeleteAccountMethod, (input: { password?: string }) => Promise<void>>
  >;
  invokeCallable: (name: string, payload: Record<string, never>) => Promise<unknown>;
  cleanupAfterDeletion: (uid: string) => Promise<void>;
  /** Keeps the root navigator off the profile gate from the call to Login. */
  exitBarrier?: AccountDeletionExitBarrier;
  /** Codes and reasons only — never tokens, emails, UIDs or passwords. */
  logDev?: (entry: DeleteAccountDevLog) => void;
};

function failed(kind: DeleteAccountFailureKind): DeleteAccountOutcome {
  return { status: 'failed', kind, messageKey: deleteAccountMessageKey(kind) };
}

/**
 * One attempt at a time: reauthenticate (or, for LinkedIn-only accounts, the
 * current session) → same UID → `deleteMyAccount({})` → local cleanup only
 * after the backend confirms. Any failure leaves the session, local state and
 * data untouched so the person can retry.
 */
export function createDeleteAccountFlow(deps: DeleteAccountFlowDeps) {
  let inProgress = false;
  const log = (entry: DeleteAccountDevLog) => {
    try {
      deps.logDev?.(entry);
    } catch {
      // Diagnostics never affect the flow.
    }
  };

  return async function deleteAccount(
    request: DeleteAccountRequest,
  ): Promise<DeleteAccountOutcome> {
    if (inProgress) return { status: 'in_progress' };
    inProgress = true;
    try {
      const user = deps.getCurrentUser();
      const uid = typeof user?.uid === 'string' && user.uid ? user.uid : null;
      if (!uid) return failed('unauthenticated');

      if (request.method === 'recent_session') {
        if (!isLinkedInOnlyAccount(user)) return failed('method_unavailable');
      } else {
        const reauthenticate = deps.reauthenticate[request.method];
        if (!resolveDeleteAccountMethods(user).includes(request.method) || !reauthenticate) {
          return failed('method_unavailable');
        }
        if (request.method === 'password' && !request.password) {
          return failed('wrong_password');
        }
        try {
          await reauthenticate({ password: request.password });
        } catch (err) {
          const kind = mapDeleteAccountReauthFailure(err, request.method);
          if (kind === 'in_progress') return { status: 'in_progress' };
          log({ stage: 'reauth', kind, code: readCode(err) || undefined });
          return failed(kind);
        }
      }

      if (deps.getCurrentUser()?.uid !== uid) return failed('uid_changed');

      const barrier = deps.exitBarrier;
      barrier?.beginRequest();
      let data: unknown;
      try {
        data = await deps.invokeCallable(DELETE_MY_ACCOUNT_CALLABLE, {});
      } catch (err) {
        barrier?.abandonRequest();
        let kind = mapDeleteMyAccountFailure(err);
        if (request.method === 'recent_session' && kind === 'stale_session') {
          kind = 'linkedin_guidance';
        }
        log({
          stage: 'callable',
          kind,
          code: readCode(err) || undefined,
          reason: readReason(err) || undefined,
        });
        return failed(kind);
      }

      const status = readConfirmedDeletion(data);
      if (!status) {
        barrier?.abandonRequest();
        log({ stage: 'response', kind: 'unknown' });
        return failed('unknown');
      }

      barrier?.confirmDeletion();
      try {
        await deps.cleanupAfterDeletion(uid);
      } catch (err) {
        // The account is gone; local cleanup is best effort.
        log({ stage: 'cleanup', code: readCode(err) || undefined });
      } finally {
        barrier?.finishCleanup();
      }
      return { status: 'deleted', alreadyDeleted: status === 'ALREADY_DELETED' };
    } finally {
      inProgress = false;
    }
  };
}

export type AccountDeletionCleanupDeps = ContractualLogoutDeps & {
  /** Per-account local caches (e.g. last confirmed Visibility). */
  clearLocalAccountState: (uid: string) => Promise<void>;
};

/**
 * After a confirmed deletion: the contractual logout sequence (publication
 * gate, FGS/background, in-flight publications, provider sessions, signOut),
 * then per-account local caches.
 */
export async function runAccountDeletionCleanup(
  uid: string,
  deps: AccountDeletionCleanupDeps,
): Promise<void> {
  try {
    await runContractualAndroidLogout(deps);
  } finally {
    await deps.clearLocalAccountState(uid).catch(() => {});
  }
}
