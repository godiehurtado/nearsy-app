/**
 * Google Sign-In use case (TS-007 Android — minimal architecture).
 *
 * Orchestrates: native ID token → RNFirebase credential exchange.
 * Does not navigate, load profiles, write Firestore, or prefill.
 *
 * Native adapters are loaded lazily so unit tests can exercise
 * createAuthenticateWithGoogle() without Google SDK / RNFirebase.
 */

export type GoogleAuthenticationResult = {
  uid: string;
  email: string | null;
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
  requestIdToken: () => Promise<{ idToken: string }>;
  signInWithIdToken: (idToken: string) => Promise<GoogleAuthenticationResult>;
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
      let idToken: string;

      try {
        const tokenResult = await deps.requestIdToken();
        idToken = tokenResult.idToken?.trim() ?? '';
      } catch (err) {
        const mapped = mapProviderFailure(err);
        logDev(mapped);
        throw mapped;
      }

      if (!idToken) {
        const mapped = new GoogleAuthenticationError(
          'INVALID_CREDENTIAL',
          'Google Sign-In did not return an ID token.',
          'ID_TOKEN_MISSING',
        );
        logDev(mapped);
        throw mapped;
      }

      try {
        return await deps.signInWithIdToken(idToken);
      } catch (err) {
        const mapped = mapFirebaseFailure(err);
        logDev(mapped);
        throw mapped;
      }
    } finally {
      inProgress = false;
    }
  };
}

async function requestIdTokenFromFoundation(): Promise<{ idToken: string }> {
  const { requestGoogleIdToken } = await import('../services/googleAuth.android');
  const result = await requestGoogleIdToken();
  return { idToken: result.idToken };
}

async function signInWithIdTokenViaFirebase(
  idToken: string,
): Promise<GoogleAuthenticationResult> {
  const { signInWithGoogleIdToken } = await import(
    '../services/firebaseGoogleAuth'
  );
  return signInWithGoogleIdToken(idToken);
}

const defaultAuthenticateWithGoogle = createAuthenticateWithGoogle({
  requestIdToken: requestIdTokenFromFoundation,
  signInWithIdToken: signInWithIdTokenViaFirebase,
});

/** Production entry point for LoginScreen. */
export async function authenticateWithGoogle(): Promise<GoogleAuthenticationResult> {
  return defaultAuthenticateWithGoogle();
}
