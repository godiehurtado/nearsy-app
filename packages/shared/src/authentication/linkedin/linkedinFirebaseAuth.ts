/**
 * Injectable Firebase Auth adapter for LinkedIn custom tokens (A3.4.4).
 *
 * Semantic boundary (mandatory):
 *   Functions customToken → signInWithCustomToken → Firebase session
 *
 * Auth readiness mirrors AppNavigator: the first onAuthStateChanged emission
 * means Firebase finished restoring/resolving session state (authLoading=false).
 * A synchronous null currentUser alone is NOT readiness.
 *
 * customToken is ephemeral — never returned, logged, or persisted.
 * Session result is UID-only.
 */

import { LinkedInAuthError } from './linkedinAuthCore.ts';

/** Minimal sanitized session — never includes customToken or profile fields. */
export type LinkedInFirebaseSession = {
  uid: string;
};

/**
 * Canonical Auth resolution snapshot (AppNavigator contract).
 * pending = first auth-state emission not yet observed.
 */
export type LinkedInAuthResolution =
  | { status: 'pending' }
  | { status: 'resolved'; uid: string | null };

/**
 * Minimal Auth port over the canonical Nearsy Firebase Auth instance.
 */
export type LinkedInFirebaseAuthPort = {
  getCurrentUserId: () => string | null;
  signInWithCustomToken: (
    customToken: string,
  ) => Promise<LinkedInFirebaseSession>;
  /**
   * Non-blocking readiness probe. May start a temporary one-shot auth-state
   * subscription; callers must tolerate pending until the first emission.
   */
  getAuthResolution: () => LinkedInAuthResolution;
};

function readFirebaseCode(err: unknown): string | undefined {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    return (err as { code: string }).code;
  }
  return undefined;
}

export function mapFirebaseCustomTokenError(err: unknown): LinkedInAuthError {
  if (err instanceof LinkedInAuthError) return err;

  const firebaseCode = readFirebaseCode(err);

  if (
    firebaseCode === 'auth/invalid-custom-token' ||
    firebaseCode === 'auth/argument-error'
  ) {
    return new LinkedInAuthError(
      'CUSTOM_TOKEN_INVALID',
      'Custom token is invalid or expired.',
      { httpsErrorCode: firebaseCode },
    );
  }
  if (firebaseCode === 'auth/custom-token-mismatch') {
    return new LinkedInAuthError(
      'CUSTOM_TOKEN_MISMATCH',
      'Custom token does not match this Firebase project.',
      { httpsErrorCode: firebaseCode },
    );
  }
  if (firebaseCode === 'auth/user-disabled') {
    return new LinkedInAuthError(
      'FIREBASE_USER_DISABLED',
      'Firebase user is disabled.',
      { httpsErrorCode: firebaseCode },
    );
  }
  if (firebaseCode === 'auth/operation-not-allowed') {
    return new LinkedInAuthError(
      'FIREBASE_OPERATION_NOT_ALLOWED',
      'Firebase sign-in is not allowed.',
      { httpsErrorCode: firebaseCode },
    );
  }
  if (firebaseCode === 'auth/too-many-requests') {
    return new LinkedInAuthError(
      'FIREBASE_TOO_MANY_REQUESTS',
      'Too many Firebase Auth requests.',
      { httpsErrorCode: firebaseCode },
    );
  }
  if (firebaseCode === 'auth/network-request-failed') {
    return new LinkedInAuthError(
      'FIREBASE_NETWORK',
      'Network error during Firebase sign-in.',
      { httpsErrorCode: firebaseCode },
    );
  }

  return new LinkedInAuthError('FIREBASE_UNKNOWN', 'Firebase sign-in failed.', {
    httpsErrorCode: firebaseCode,
  });
}

export function isTerminalFirebaseSignInError(err: LinkedInAuthError): boolean {
  return (
    err.code === 'CUSTOM_TOKEN_INVALID' ||
    err.code === 'CUSTOM_TOKEN_MISMATCH' ||
    err.code === 'FIREBASE_USER_DISABLED' ||
    err.code === 'FIREBASE_OPERATION_NOT_ALLOWED' ||
    err.code === 'FIREBASE_TOO_MANY_REQUESTS'
  );
}

export function isUncertainFirebaseSignInError(err: LinkedInAuthError): boolean {
  return err.code === 'FIREBASE_NETWORK' || err.code === 'FIREBASE_UNKNOWN';
}

export async function signInWithLinkedInCustomToken(
  auth: LinkedInFirebaseAuthPort,
  customToken: string,
): Promise<LinkedInFirebaseSession> {
  if (typeof customToken !== 'string' || customToken.length < 1) {
    throw new LinkedInAuthError(
      'CUSTOM_TOKEN_INVALID',
      'Custom token is invalid or expired.',
    );
  }

  try {
    const session = await auth.signInWithCustomToken(customToken);
    if (!session || typeof session.uid !== 'string' || session.uid.length < 1) {
      throw new LinkedInAuthError(
        'FIREBASE_UNKNOWN',
        'Firebase sign-in failed.',
      );
    }
    return { uid: session.uid };
  } catch (err) {
    throw mapFirebaseCustomTokenError(err);
  }
}
