/**
 * LinkedIn Firebase session orchestration (A3.4.4).
 *
 * Public entry points complete OAuth client work and immediately consume the
 * ephemeral customToken via signInWithCustomToken. They never return the token.
 *
 * Uncertain Firebase sign-in (NETWORK / UNKNOWN after Exchange consumed):
 * - Sets a process-local reconciliation barrier (never stores the token)
 * - Blocks new LinkedIn flows until reconcile yields authenticated|cleared
 * - Reconcile uses Auth readiness (first onAuthStateChanged), not a bare
 *   synchronous null currentUser read
 * - pending keeps the barrier; only authenticated|cleared clear it
 *
 * Process restart:
 * - Barrier disappears (process-local)
 * - Entry points require getAuthResolution().status === 'resolved' before Start
 *   (explicit precondition for future App.tsx/UI wiring — mirrors AppNavigator
 *   authLoading===false). A3.4.4 does not wire App.tsx itself.
 *
 * Residual multi-provider UI concurrency remains deferred to UI.
 */

import {
  discardLinkedInAuthTransaction,
  runLinkedInBrowserAuthFlow,
  type LinkedInCoordinatorDeps,
  type LinkedInPendingExchangeClaim,
} from './linkedinAuthCoordinator.ts';
import {
  signInWithLinkedInCustomToken,
  isUncertainFirebaseSignInError,
  type LinkedInFirebaseAuthPort,
  type LinkedInFirebaseSession,
} from './linkedinFirebaseAuth.ts';
import {
  BASE64URL_RE,
  LinkedInAuthError,
  linkedInAuthExchange,
  MAX_TRANSACTION_ID_LEN,
  MIN_TRANSACTION_ID_LEN,
  type LinkedInAuthClientDeps,
} from './linkedinAuthCore.ts';

export type LinkedInSessionDeps = LinkedInCoordinatorDeps & {
  firebaseAuth: LinkedInFirebaseAuthPort;
};

export type LinkedInSessionResult =
  | { status: 'authenticated'; session: LinkedInFirebaseSession }
  | { status: 'cancelled' }
  | { status: 'dismissed' }
  | { status: 'provider_error'; errorCode: string; transactionId?: string }
  | { status: 'session_already_active' }
  | { status: 'session_changed_during_flow' }
  | { status: 'ignored' }
  | { status: 'failed'; error: LinkedInAuthError }
  | { status: 'uncertain'; error: LinkedInAuthError };

export type LinkedInUncertainBarrier = {
  kind: 'firebase_sign_in_uncertain';
  at: number;
  errorCode: 'FIREBASE_NETWORK' | 'FIREBASE_UNKNOWN';
};

export type LinkedInReconcileResult =
  | { status: 'not_uncertain' }
  | { status: 'pending' }
  | { status: 'authenticated'; session: LinkedInFirebaseSession }
  | { status: 'cleared' };

let sessionFlowInFlight = false;
let signInInFlight = false;
let uncertainBarrier: LinkedInUncertainBarrier | null = null;

/** Test-only */
export function __resetLinkedInSessionForTests(): void {
  sessionFlowInFlight = false;
  signInInFlight = false;
  uncertainBarrier = null;
}

export function getLinkedInFirebaseUncertainBarrier(): LinkedInUncertainBarrier | null {
  return uncertainBarrier;
}

function setUncertainBarrier(
  err: LinkedInAuthError,
  auth: LinkedInFirebaseAuthPort,
): void {
  const errorCode =
    err.code === 'FIREBASE_NETWORK' ? 'FIREBASE_NETWORK' : 'FIREBASE_UNKNOWN';
  uncertainBarrier = {
    kind: 'firebase_sign_in_uncertain',
    at: Date.now(),
    errorCode,
  };
  // Kick the one-shot readiness watch (AppNavigator-equivalent).
  try {
    auth.getAuthResolution();
  } catch {
    // Keep barrier; reconcile will stay pending / safe.
  }
}

function blockIfUncertainPending(): LinkedInSessionResult | null {
  if (!uncertainBarrier) return null;
  return {
    status: 'failed',
    error: new LinkedInAuthError(
      'FIREBASE_UNCERTAIN_PENDING',
      'Reconcile Firebase Auth state before starting LinkedIn again.',
    ),
  };
}

/**
 * Preconditions for future App.tsx / UI wiring (comprobables via port):
 * Do not invoke LinkedIn session entry points until Firebase Auth has emitted
 * its first auth-state resolution (AppNavigator authLoading === false).
 */
function blockIfAuthNotReady(
  auth: LinkedInFirebaseAuthPort,
): LinkedInSessionResult | null {
  try {
    const snap = auth.getAuthResolution();
    if (snap.status === 'pending') {
      return {
        status: 'failed',
        error: new LinkedInAuthError(
          'FIREBASE_AUTH_NOT_READY',
          'Firebase Auth has not finished restoring the session.',
        ),
      };
    }
    return null;
  } catch {
    return {
      status: 'failed',
      error: new LinkedInAuthError(
        'FIREBASE_AUTH_NOT_READY',
        'Firebase Auth has not finished restoring the session.',
      ),
    };
  }
}

/**
 * Explicit reconciliation after an uncertain Firebase sign-in.
 * Does not use or restore any customToken. Does not signOut.
 *
 * - pending: Auth not yet resolved → keep barrier
 * - authenticated: Auth resolved with user → clear barrier
 * - cleared: Auth resolved without user → clear barrier (new OAuth allowed)
 */
export function reconcileLinkedInFirebaseUncertainState(
  auth: LinkedInFirebaseAuthPort,
): LinkedInReconcileResult {
  if (!uncertainBarrier) {
    return { status: 'not_uncertain' };
  }
  try {
    const snap = auth.getAuthResolution();
    if (snap.status === 'pending') {
      return { status: 'pending' };
    }
    if (snap.uid) {
      uncertainBarrier = null;
      return { status: 'authenticated', session: { uid: snap.uid } };
    }
    uncertainBarrier = null;
    return { status: 'cleared' };
  } catch {
    // Safe policy: keep barrier when resolution probe fails.
    return { status: 'pending' };
  }
}

export function expectedLinkedInSuccessFingerprint(
  transactionId: string,
): string {
  return `ok:${transactionId}`;
}

export function assertLinkedInPendingExchangeClaim(
  claim: unknown,
): LinkedInPendingExchangeClaim {
  if (!claim || typeof claim !== 'object') {
    throw new LinkedInAuthError(
      'CALLBACK_INVALID',
      'LinkedIn return URL is invalid.',
    );
  }
  const c = claim as Record<string, unknown>;
  if (
    typeof c.transactionId !== 'string' ||
    c.transactionId.length < MIN_TRANSACTION_ID_LEN ||
    c.transactionId.length > MAX_TRANSACTION_ID_LEN ||
    !BASE64URL_RE.test(c.transactionId)
  ) {
    throw new LinkedInAuthError(
      'CALLBACK_INVALID',
      'LinkedIn return URL is invalid.',
    );
  }
  if (typeof c.fingerprint !== 'string' || c.fingerprint.length < 1) {
    throw new LinkedInAuthError(
      'CALLBACK_INVALID',
      'LinkedIn return URL is invalid.',
    );
  }
  const expected = expectedLinkedInSuccessFingerprint(c.transactionId);
  if (c.fingerprint !== expected) {
    throw new LinkedInAuthError(
      'CALLBACK_MISMATCH',
      'LinkedIn return does not match the local transaction.',
    );
  }
  return {
    transactionId: c.transactionId,
    fingerprint: c.fingerprint,
  };
}

async function performSignInOnce(
  auth: LinkedInFirebaseAuthPort,
  customToken: string,
): Promise<LinkedInSessionResult> {
  if (signInInFlight) {
    return {
      status: 'failed',
      error: new LinkedInAuthError(
        'OPERATION_IN_PROGRESS',
        'A LinkedIn auth operation is already in progress.',
      ),
    };
  }
  signInInFlight = true;
  try {
    if (auth.getCurrentUserId()) {
      return { status: 'session_changed_during_flow' };
    }
    const session = await signInWithLinkedInCustomToken(auth, customToken);
    return { status: 'authenticated', session };
  } catch (err) {
    const normalized =
      err instanceof LinkedInAuthError
        ? err
        : new LinkedInAuthError('FIREBASE_UNKNOWN', 'Firebase sign-in failed.');
    if (isUncertainFirebaseSignInError(normalized)) {
      setUncertainBarrier(normalized, auth);
      return { status: 'uncertain', error: normalized };
    }
    return { status: 'failed', error: normalized };
  } finally {
    signInInFlight = false;
  }
}

export async function authenticateWithLinkedInBrowser(
  deps: LinkedInSessionDeps,
): Promise<LinkedInSessionResult> {
  const blockedUncertain = blockIfUncertainPending();
  if (blockedUncertain) return blockedUncertain;

  const blockedAuth = blockIfAuthNotReady(deps.firebaseAuth);
  if (blockedAuth) return blockedAuth;

  if (sessionFlowInFlight) {
    return {
      status: 'failed',
      error: new LinkedInAuthError(
        'OPERATION_IN_PROGRESS',
        'A LinkedIn auth operation is already in progress.',
      ),
    };
  }
  sessionFlowInFlight = true;
  try {
    if (deps.firebaseAuth.getCurrentUserId()) {
      await discardLinkedInAuthTransaction(deps).catch(() => undefined);
      return { status: 'session_already_active' };
    }

    const flow = await runLinkedInBrowserAuthFlow(deps);

    if (flow.status === 'cancelled') return { status: 'cancelled' };
    if (flow.status === 'dismissed') return { status: 'dismissed' };
    if (flow.status === 'provider_error') {
      return {
        status: 'provider_error',
        errorCode: flow.errorCode,
        transactionId: flow.transactionId,
      };
    }
    if (flow.status === 'failed') {
      return { status: 'failed', error: flow.error };
    }
    if (flow.status !== 'authenticated') {
      return {
        status: 'failed',
        error: new LinkedInAuthError(
          'UNKNOWN',
          'LinkedIn authentication failed.',
        ),
      };
    }

    const customToken = flow.customToken;

    if (deps.firebaseAuth.getCurrentUserId()) {
      return { status: 'session_changed_during_flow' };
    }

    return await performSignInOnce(deps.firebaseAuth, customToken);
  } finally {
    sessionFlowInFlight = false;
  }
}

export async function authenticateWithLinkedInColdStartClaim(
  deps: LinkedInSessionDeps,
  claimInput: unknown,
): Promise<LinkedInSessionResult> {
  const blockedUncertain = blockIfUncertainPending();
  if (blockedUncertain) return blockedUncertain;

  const blockedAuth = blockIfAuthNotReady(deps.firebaseAuth);
  if (blockedAuth) return blockedAuth;

  if (sessionFlowInFlight) {
    return {
      status: 'failed',
      error: new LinkedInAuthError(
        'OPERATION_IN_PROGRESS',
        'A LinkedIn auth operation is already in progress.',
      ),
    };
  }
  sessionFlowInFlight = true;
  try {
    if (deps.firebaseAuth.getCurrentUserId()) {
      await discardLinkedInAuthTransaction(deps).catch(() => undefined);
      return { status: 'session_already_active' };
    }

    let claim: LinkedInPendingExchangeClaim;
    try {
      claim = assertLinkedInPendingExchangeClaim(claimInput);
    } catch (err) {
      return {
        status: 'failed',
        error:
          err instanceof LinkedInAuthError
            ? err
            : new LinkedInAuthError(
                'CALLBACK_INVALID',
                'LinkedIn return URL is invalid.',
              ),
      };
    }

    let stored;
    try {
      stored = await deps.store.read();
    } catch (err) {
      return {
        status: 'failed',
        error:
          err instanceof LinkedInAuthError
            ? err
            : new LinkedInAuthError(
                'TRANSACTION_CORRUPT',
                'Stored LinkedIn transaction is corrupt.',
              ),
      };
    }
    if (!stored || stored.transactionId !== claim.transactionId) {
      return {
        status: 'failed',
        error: new LinkedInAuthError(
          'TRANSACTION_MISSING',
          'No LinkedIn auth transaction is available.',
        ),
      };
    }

    let customToken: string;
    try {
      const exchanged = await linkedInAuthExchange(
        deps as LinkedInAuthClientDeps,
        { transactionId: claim.transactionId },
      );
      customToken = exchanged.customToken;
    } catch (err) {
      const normalized =
        err instanceof LinkedInAuthError
          ? err
          : new LinkedInAuthError(
              'UNKNOWN',
              'LinkedIn authentication failed.',
            );
      return { status: 'failed', error: normalized };
    }

    if (deps.firebaseAuth.getCurrentUserId()) {
      return { status: 'session_changed_during_flow' };
    }

    return await performSignInOnce(deps.firebaseAuth, customToken);
  } finally {
    sessionFlowInFlight = false;
  }
}
