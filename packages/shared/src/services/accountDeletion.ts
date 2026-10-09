/**
 * Account deletion orchestration.
 *
 * The `deleteMyAccount` callable is the only authority that deletes Firebase
 * Auth and account data (Firestore, Storage, Visibility, matching). This client
 * only proves a recent sign-in for the same UID and invokes it once.
 * Firebase SDK is loaded only inside the default runtime so Node tests stay RN-free.
 */

import {
  beginAccountDeletionSession,
  endAccountDeletionSession,
  markAccountDeletionClosing,
} from './accountDeletionSession';
import {
  clearPendingAccountDeletion,
  markAccountDeletionUncertain,
} from './accountDeletionReconciliation';
import {
  AccountDeletionReauthError,
  type AccountDeletionReauthErrorCode,
} from './deletionReauth/accountDeletionReauthError';
import type { DeletionReauthMethod } from './deletionReauth/deletionReauthMethod';
import {
  DELETE_MY_ACCOUNT_CLIENT_FRESH_AUTH_SECONDS,
  DeleteMyAccountError,
  isDeleteMyAccountError,
  mapDeleteMyAccountFailure,
  type DeleteMyAccountFailureKind,
  type DeleteMyAccountStatus,
  type DeleteMyAccountSuccess,
} from './deleteMyAccount/contract';
import { resolveDeleteMyAccountMessageKey } from './accountDeletionErrorPresentation';

/** Tolerated device clock lead over the token's `auth_time`. */
const AUTH_TIME_FUTURE_SKEW_SECONDS = 60;

export type AccountDeletionRuntime = {
  getCurrentUid: () => string | null;
  /** Auth `metadata.creationTime` of the current user, when known. */
  getCurrentCreatedAt?: () => string | null;
  /** `auth_time` of the current Firebase ID token in ms, or null when unknown. */
  getAuthTimeMs: () => Promise<number | null>;
  nowMs?: () => number;
  reauthenticate: (input: {
    method: DeletionReauthMethod;
    password?: string;
    expectedUid: string;
  }) => Promise<void>;
  deleteMyAccount: (input: { expectedUid: string }) => Promise<DeleteMyAccountSuccess>;
};

export type AccountDeletionRequest = {
  /** Omit to use the current session when it is recent enough. */
  reauth?: { method: DeletionReauthMethod; password?: string };
  /** With `reauth`: skip it while the current session is still recent. */
  reauthOnlyIfStale?: boolean;
};

export type AccountDeletionFailure =
  | DeleteMyAccountFailureKind
  | AccountDeletionReauthErrorCode;

export type AccountDeletionResult =
  | { status: 'deleted'; uid: string; backendStatus: DeleteMyAccountStatus }
  | { status: 'reauth_required' }
  | { status: 'cancelled' }
  | { status: 'busy' }
  | {
      status: 'failed';
      failure: AccountDeletionFailure;
      messageKey: string;
      reauthRequired: boolean;
      serverMayHaveDeleted: boolean;
    };

let inFlight = false;

export function isAccountDeletionInFlight(): boolean {
  return inFlight;
}

export function isAuthTimeRecentForDeletion(
  authTimeMs: number | null,
  nowMs: number,
): boolean {
  if (authTimeMs === null || !Number.isFinite(authTimeMs) || authTimeMs <= 0) return false;
  const ageSeconds = Math.floor((nowMs - authTimeMs) / 1000);
  return (
    ageSeconds >= -AUTH_TIME_FUTURE_SKEW_SECONDS &&
    ageSeconds <= DELETE_MY_ACCOUNT_CLIENT_FRESH_AUTH_SECONDS
  );
}

async function isCurrentSessionRecent(runtime: AccountDeletionRuntime): Promise<boolean> {
  let authTimeMs: number | null = null;
  try {
    authTimeMs = await runtime.getAuthTimeMs();
  } catch {
    authTimeMs = null;
  }
  return isAuthTimeRecentForDeletion(authTimeMs, (runtime.nowMs ?? Date.now)());
}

function failedFromDeleteError(err: DeleteMyAccountError): AccountDeletionResult {
  return {
    status: 'failed',
    failure: err.kind,
    messageKey: resolveDeleteMyAccountMessageKey(err.kind),
    reauthRequired: err.kind === 'RECENT_LOGIN_REQUIRED',
    serverMayHaveDeleted: err.serverMayHaveDeleted,
  };
}

function failedFromReauthError(err: AccountDeletionReauthError): AccountDeletionResult {
  return {
    status: 'failed',
    failure: err.code,
    messageKey: err.messageKey,
    reauthRequired: false,
    serverMayHaveDeleted: false,
  };
}

/**
 * Delete the signed-in account through the backend.
 * Never deletes Firebase Auth itself and never writes Firestore or Storage.
 */
export async function deleteAccountWithBackend(
  request: AccountDeletionRequest = {},
  runtime: AccountDeletionRuntime = createDefaultAccountDeletionRuntime(),
): Promise<AccountDeletionResult> {
  if (inFlight) return { status: 'busy' };
  inFlight = true;
  try {
    const uid = runtime.getCurrentUid();
    if (!uid) {
      return failedFromDeleteError(new DeleteMyAccountError('UNAUTHENTICATED', false));
    }

    const checkRecent = !request.reauth || request.reauthOnlyIfStale === true;
    const recent = checkRecent ? await isCurrentSessionRecent(runtime) : false;

    if (request.reauth && !recent) {
      try {
        await runtime.reauthenticate({ ...request.reauth, expectedUid: uid });
      } catch (err) {
        if (err instanceof AccountDeletionReauthError) {
          if (err.code === 'CANCELLED') return { status: 'cancelled' };
          return failedFromReauthError(err);
        }
        return failedFromReauthError(
          new AccountDeletionReauthError('REAUTH_FAILED', 'settings.deleteAccount.reauthFailed'),
        );
      }
    } else if (!request.reauth && !recent) {
      return { status: 'reauth_required' };
    }

    if (runtime.getCurrentUid() !== uid) {
      return failedFromDeleteError(new DeleteMyAccountError('IDENTITY_CHANGED', false));
    }

    // Keeps AppNavigator off CompleteProfile while the backend removes users/{uid}.
    beginAccountDeletionSession();
    let response: DeleteMyAccountSuccess;
    try {
      response = await runtime.deleteMyAccount({ expectedUid: uid });
    } catch (err) {
      const failure = isDeleteMyAccountError(err) ? err : mapDeleteMyAccountFailure(err);
      if (failure.serverMayHaveDeleted) {
        // users/{uid} may already be gone: keep the Profile Gate suspended
        // (also across relaunches) until Auth is reconciled.
        markAccountDeletionUncertain({
          uid,
          createdAt: runtime.getCurrentCreatedAt?.() ?? null,
        });
      } else {
        endAccountDeletionSession();
      }
      return failedFromDeleteError(failure);
    }
    // Session flag stays active until finalizePostAccountDeletionSession; the
    // closure barrier stays until Auth reports the signed-out state. The
    // barrier is engaged before an unresolved marker is released.
    markAccountDeletionClosing(uid);
    clearPendingAccountDeletion();
    return { status: 'deleted', uid, backendStatus: response.status };
  } finally {
    inFlight = false;
  }
}

export function createDefaultAccountDeletionRuntime(): AccountDeletionRuntime {
  // Lazy requires keep Node unit tests free of RN Firebase config.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { firebaseAuth } = require('../config/firebaseConfig') as {
    firebaseAuth: {
      currentUser: {
        uid: string;
        metadata?: { creationTime?: string };
        getIdTokenResult: () => Promise<{ authTime: string }>;
      } | null;
    };
  };

  return {
    getCurrentUid: () => firebaseAuth.currentUser?.uid ?? null,
    getCurrentCreatedAt: () => firebaseAuth.currentUser?.metadata?.creationTime ?? null,
    getAuthTimeMs: async () => {
      const user = firebaseAuth.currentUser;
      if (!user) return null;
      const result = await user.getIdTokenResult();
      const parsed = Date.parse(result.authTime);
      return Number.isFinite(parsed) ? parsed : null;
    },
    reauthenticate: async (input) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { reauthenticateForAccountDeletion } = require('./deletionReauth') as typeof import('./deletionReauth');
      await reauthenticateForAccountDeletion(input);
    },
    deleteMyAccount: async (input) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDeleteMyAccountPort } = require('./deleteMyAccount/iosDeleteMyAccountFoundation') as typeof import('./deleteMyAccount/iosDeleteMyAccountFoundation');
      let port: Awaited<ReturnType<typeof getDeleteMyAccountPort>>;
      try {
        port = await getDeleteMyAccountPort();
      } catch (err) {
        // Composition failed before any request was sent.
        throw isDeleteMyAccountError(err) ? err : new DeleteMyAccountError('UNKNOWN', false);
      }
      return port.deleteMyAccount(input);
    },
  };
}
