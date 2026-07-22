/**
 * Google Sign-In use case (TS-007 / TS-008 Android — minimal architecture).
 *
 * Orchestrates: native ID token → RNFirebase credential exchange.
 * TS-008: builds a token-free prefill and stores it one-shot by UID
 * before returning (race-safe vs AppNavigator remount).
 *
 * Does not navigate, write Firestore, or merge into CompleteProfile.
 *
 * Native adapters are loaded lazily so unit tests can exercise
 * createAuthenticateWithGoogle() without Google SDK / RNFirebase.
 */

import type { GoogleProfilePrefill } from './googleProfilePrefillStore';

export type { GoogleProfilePrefill };

export type GoogleAuthenticationResult = {
  uid: string;
  email: string | null;
  /** Safe Google suggestions for CompleteProfile (no tokens). */
  prefill?: GoogleProfilePrefill;
};

/** Identity fields from Google Sign-In (idToken stays local to the use case). */
export type GoogleIdTokenRequestResult = {
  idToken: string;
  email?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  photoUrl?: string | null;
};

export type GoogleIdentityFields = {
  email?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  photoUrl?: string | null;
};

export type GoogleAuthenticationErrorCode =
  | 'CANCELLED'
  | 'OPERATION_IN_PROGRESS'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_CREDENTIAL'
  | 'USER_DISABLED'
  | 'UNKNOWN';

const MESSAGE_KEYS: Record<GoogleAuthenticationErrorCode, string> = {
  CANCELLED: 'authentication.social.google.errors.generic',
  OPERATION_IN_PROGRESS: 'authentication.social.google.errors.generic',
  PROVIDER_UNAVAILABLE:
    'authentication.social.google.errors.providerUnavailable',
  CONFIGURATION_ERROR: 'authentication.social.google.errors.configuration',
  NETWORK_ERROR: 'authentication.social.google.errors.network',
  INVALID_CREDENTIAL: 'authentication.social.google.errors.invalidCredential',
  USER_DISABLED: 'authentication.social.google.errors.userDisabled',
  UNKNOWN: 'authentication.social.google.errors.generic',
};

export class GoogleAuthenticationError extends Error {
  readonly code: GoogleAuthenticationErrorCode;
  readonly messageKey: string;
  readonly diagnosticCode?: string;

  constructor(
    code: GoogleAuthenticationErrorCode,
    message: string,
    diagnosticCode?: string,
  ) {
    super(message);
    this.name = 'GoogleAuthenticationError';
    this.code = code;
    this.messageKey = MESSAGE_KEYS[code];
    this.diagnosticCode = diagnosticCode;
  }
}

export function messageKeyForGoogleAuthError(
  code: GoogleAuthenticationErrorCode,
): string {
  return MESSAGE_KEYS[code];
}

export type AuthenticateWithGoogleDeps = {
  requestIdToken: () => Promise<GoogleIdTokenRequestResult>;
  signInWithIdToken: (
    idToken: string,
  ) => Promise<{ uid: string; email: string | null }>;
  /**
   * Persist safe prefill for CompleteProfile (TS-008).
   * Injected so Node unit tests need not resolve Metro modules.
   */
  commitPrefill?: (
    uid: string,
    identity: GoogleIdentityFields,
  ) => Promise<GoogleProfilePrefill | undefined> | GoogleProfilePrefill | undefined;
};

const FOUNDATION_CODE_MAP: Record<string, GoogleAuthenticationErrorCode> = {
  UNSUPPORTED_PLATFORM: 'CONFIGURATION_ERROR',
  MISSING_WEB_CLIENT_ID: 'CONFIGURATION_ERROR',
  NATIVE_MODULE_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PLAY_SERVICES_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  CONFIGURATION_FAILED: 'CONFIGURATION_ERROR',
  SIGN_IN_CANCELLED: 'CANCELLED',
  SIGN_IN_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  SIGN_IN_FAILED: 'UNKNOWN',
  MISSING_ID_TOKEN: 'INVALID_CREDENTIAL',
};

const FIREBASE_ADAPTER_CODE_MAP: Record<string, GoogleAuthenticationErrorCode> =
  {
    NETWORK_ERROR: 'NETWORK_ERROR',
    INVALID_CREDENTIAL: 'INVALID_CREDENTIAL',
    USER_DISABLED: 'USER_DISABLED',
    UNKNOWN: 'UNKNOWN',
  };

function readCode(err: unknown): string | undefined {
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

function readMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function mapProviderFailure(err: unknown): GoogleAuthenticationError {
  if (err instanceof GoogleAuthenticationError) {
    return err;
  }

  const code = readCode(err);
  if (code && FOUNDATION_CODE_MAP[code]) {
    return new GoogleAuthenticationError(
      FOUNDATION_CODE_MAP[code],
      readMessage(err, 'Google sign-in failed.'),
      code,
    );
  }

  return new GoogleAuthenticationError(
    'UNKNOWN',
    readMessage(err, 'Google sign-in failed before Firebase exchange.'),
    'PROVIDER_UNKNOWN',
  );
}

function mapFirebaseFailure(err: unknown): GoogleAuthenticationError {
  if (err instanceof GoogleAuthenticationError) {
    return err;
  }

  const code = readCode(err);
  if (code && FIREBASE_ADAPTER_CODE_MAP[code]) {
    const diagnostic =
      typeof err === 'object' &&
      err !== null &&
      'firebaseCode' in err &&
      typeof (err as { firebaseCode: unknown }).firebaseCode === 'string'
        ? (err as { firebaseCode: string }).firebaseCode
        : code;

    return new GoogleAuthenticationError(
      FIREBASE_ADAPTER_CODE_MAP[code],
      readMessage(err, 'Firebase Google sign-in failed.'),
      diagnostic,
    );
  }

  return new GoogleAuthenticationError(
    'UNKNOWN',
    readMessage(err, 'Firebase Google sign-in failed.'),
    'FIREBASE_UNKNOWN',
  );
}

function sanitizeForDevLog(err: GoogleAuthenticationError): {
  code: GoogleAuthenticationErrorCode;
  diagnosticCode?: string;
} {
  return {
    code: err.code,
    diagnosticCode: err.diagnosticCode,
  };
}

function logDev(err: GoogleAuthenticationError): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[authenticateWithGoogle]', sanitizeForDevLog(err));
  }
}

/**
 * Factory used by Login (default wiring) and unit tests (injected deps).
 */
export function createAuthenticateWithGoogle(deps: AuthenticateWithGoogleDeps) {
  let inProgress = false;

  return async function authenticateWithGoogle(): Promise<GoogleAuthenticationResult> {
    if (inProgress) {
      const err = new GoogleAuthenticationError(
        'OPERATION_IN_PROGRESS',
        'Google sign-in is already in progress.',
        'ORCHESTRATOR_IN_PROGRESS',
      );
      logDev(err);
      throw err;
    }

    inProgress = true;

    try {
      let tokenResult: GoogleIdTokenRequestResult;

      try {
        tokenResult = await deps.requestIdToken();
      } catch (err) {
        const mapped = mapProviderFailure(err);
        logDev(mapped);
        throw mapped;
      }

      const idToken = tokenResult.idToken?.trim() ?? '';
      if (!idToken) {
        const mapped = new GoogleAuthenticationError(
          'INVALID_CREDENTIAL',
          'Google Sign-In did not return an ID token.',
          'ID_TOKEN_MISSING',
        );
        logDev(mapped);
        throw mapped;
      }

      let session: { uid: string; email: string | null };
      try {
        session = await deps.signInWithIdToken(idToken);
      } catch (err) {
        const mapped = mapFirebaseFailure(err);
        logDev(mapped);
        throw mapped;
      }

      let prefill: GoogleProfilePrefill | undefined;
      if (deps.commitPrefill && session.uid) {
        try {
          prefill =
            (await deps.commitPrefill(session.uid, {
              email: tokenResult.email,
              displayName: tokenResult.displayName,
              givenName: tokenResult.givenName,
              familyName: tokenResult.familyName,
              photoUrl: tokenResult.photoUrl,
            })) ?? undefined;
        } catch {
          prefill = undefined;
        }
      }

      return {
        uid: session.uid,
        email: session.email ?? tokenResult.email ?? null,
        ...(prefill ? { prefill } : {}),
      };
    } finally {
      inProgress = false;
    }
  };
}

/**
 * Production prefill commit: sanitize + one-shot in-memory store (TS-008).
 * Runs before Login returns so AppNavigator remount can still consume it.
 */
let prefillStoreModule: typeof import('./googleProfilePrefillStore') | null =
  null;

async function loadPrefillStoreModule() {
  if (!prefillStoreModule) {
    prefillStoreModule = await import('./googleProfilePrefillStore');
  }
  return prefillStoreModule;
}

async function commitGoogleProfilePrefill(
  uid: string,
  identity: GoogleIdentityFields,
): Promise<GoogleProfilePrefill | undefined> {
  const {
    buildGoogleProfilePrefill,
    setPendingGoogleProfilePrefill,
  } = await loadPrefillStoreModule();

  const prefill = buildGoogleProfilePrefill(identity);
  if (Object.keys(prefill).length === 0) {
    return undefined;
  }
  setPendingGoogleProfilePrefill(uid, prefill);
  return prefill;
}

async function requestIdTokenFromFoundation(): Promise<GoogleIdTokenRequestResult> {
  const { requestGoogleIdToken } = await import('../services/googleAuth.android');
  const result = await requestGoogleIdToken();
  return {
    idToken: result.idToken,
    email: result.email,
    displayName: result.displayName,
    givenName: result.givenName,
    familyName: result.familyName,
    photoUrl: result.photoUrl,
  };
}

async function signInWithIdTokenViaFirebase(
  idToken: string,
): Promise<{ uid: string; email: string | null }> {
  const { signInWithGoogleIdToken } = await import(
    '../services/firebaseGoogleAuth'
  );
  return signInWithGoogleIdToken(idToken);
}

const defaultAuthenticateWithGoogle = createAuthenticateWithGoogle({
  requestIdToken: requestIdTokenFromFoundation,
  signInWithIdToken: signInWithIdTokenViaFirebase,
  commitPrefill: commitGoogleProfilePrefill,
});

/**
 * Production entry point for LoginScreen.
 * Prefetches the prefill store before Google UI so setPending after Firebase
 * is effectively synchronous (avoids AppNavigator remount consuming too early).
 */
export async function authenticateWithGoogle(): Promise<GoogleAuthenticationResult> {
  try {
    await loadPrefillStoreModule();
  } catch {
    // Fail-soft: auth still proceeds; prefill may be skipped.
  }
  return defaultAuthenticateWithGoogle();
}
