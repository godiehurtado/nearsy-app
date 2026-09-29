/**
 * Facebook Login use case core (ENH-AUTH-FB-01, Android).
 *
 * Orchestrates: native Facebook access token → Firebase FacebookAuthProvider
 * credential → signInWithCredential (or reauthenticateWithCredential).
 * Pure module: no Facebook SDK / RNFirebase imports so Node tests inject deps.
 *
 * Never logs, returns or persists the access token. No account linking:
 * `auth/account-exists-with-different-credential` surfaces as an error.
 */
import {
  buildGoogleProfilePrefill,
  type GoogleProfilePrefill,
} from '../googleProfilePrefillStore.ts';

/** Only basic Login permissions; no advanced / reviewed permissions. */
export const FACEBOOK_LOGIN_PERMISSIONS: readonly string[] = Object.freeze([
  'public_profile',
  'email',
]);

export const FACEBOOK_FIREBASE_PROVIDER_ID = 'facebook.com';

export type FacebookAuthenticationErrorCode =
  | 'CANCELLED'
  | 'OPERATION_IN_PROGRESS'
  | 'NOT_CONFIGURED'
  | 'TOKEN_MISSING'
  | 'SDK_ERROR'
  | 'NETWORK_ERROR'
  | 'ACCOUNT_CONFLICT'
  | 'USER_MISMATCH'
  | 'INVALID_CREDENTIAL'
  | 'USER_DISABLED'
  | 'FIREBASE_ERROR';

const CANCELLED_KEY = 'authentication.social.facebook.errors.cancelled';
const GENERIC_KEY = 'authentication.social.facebook.errors.generic';

const MESSAGE_KEYS: Record<FacebookAuthenticationErrorCode, string> = {
  CANCELLED: CANCELLED_KEY,
  OPERATION_IN_PROGRESS: GENERIC_KEY,
  NOT_CONFIGURED: GENERIC_KEY,
  TOKEN_MISSING: GENERIC_KEY,
  SDK_ERROR: GENERIC_KEY,
  NETWORK_ERROR: GENERIC_KEY,
  ACCOUNT_CONFLICT: GENERIC_KEY,
  USER_MISMATCH: GENERIC_KEY,
  INVALID_CREDENTIAL: GENERIC_KEY,
  USER_DISABLED: GENERIC_KEY,
  FIREBASE_ERROR: GENERIC_KEY,
};

export function messageKeyForFacebookAuthError(
  code: FacebookAuthenticationErrorCode,
): string {
  return MESSAGE_KEYS[code];
}

export class FacebookAuthenticationError extends Error {
  readonly code: FacebookAuthenticationErrorCode;
  readonly messageKey: string;
  /** Sanitized diagnostic (SDK / Firebase error code); never a token or PII. */
  readonly diagnosticCode?: string;

  constructor(
    code: FacebookAuthenticationErrorCode,
    message: string,
    diagnosticCode?: string,
  ) {
    super(message);
    this.name = 'FacebookAuthenticationError';
    this.code = code;
    this.messageKey = MESSAGE_KEYS[code];
    this.diagnosticCode = diagnosticCode;
  }
}

/** Identity fields Nearsy may prefill: name, photo and (optional) email. */
export type FacebookIdentityFields = {
  email?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  photoUrl?: string | null;
};

export type FacebookFirebaseSession = {
  uid: string;
  email: string | null;
  identity: FacebookIdentityFields;
};

export type FacebookAuthenticationResult = {
  uid: string;
  email: string | null;
  prefill?: GoogleProfilePrefill;
};

export type FacebookAccessTokenResult = {
  accessToken: string | null | undefined;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Whitelist name / photo / email from a Firebase UserCredential.
 * Prefers `additionalUserInfo.profile` (Graph fields granted by
 * public_profile + email) and falls back to the Firebase user record.
 */
export function extractFacebookIdentity(credential: {
  user?: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  } | null;
  additionalUserInfo?: { profile?: Record<string, unknown> | null } | null;
}): FacebookIdentityFields {
  const profile = readRecord(credential.additionalUserInfo?.profile) ?? {};
  const pictureData = readRecord(readRecord(profile.picture)?.data);
  const user = credential.user ?? undefined;

  const identity: FacebookIdentityFields = {};
  const email = readString(profile.email) ?? readString(user?.email);
  if (email) identity.email = email;
  const displayName = readString(profile.name) ?? readString(user?.displayName);
  if (displayName) identity.displayName = displayName;
  const givenName = readString(profile.first_name);
  if (givenName) identity.givenName = givenName;
  const familyName = readString(profile.last_name);
  if (familyName) identity.familyName = familyName;
  const photoUrl = readString(pictureData?.url) ?? readString(user?.photoURL);
  if (photoUrl) identity.photoUrl = photoUrl;
  return identity;
}

/** Token-free CRJ prefill (https photo only, empty fields dropped). */
export function buildFacebookProfilePrefill(
  identity: FacebookIdentityFields,
): GoogleProfilePrefill | undefined {
  const prefill = buildGoogleProfilePrefill({
    email: identity.email,
    displayName: identity.displayName,
    givenName: identity.givenName,
    familyName: identity.familyName,
    photoUrl: identity.photoUrl,
  });
  return Object.keys(prefill).length > 0 ? prefill : undefined;
}

function readCode(err: unknown): string | undefined {
  const record = readRecord(err);
  return typeof record?.code === 'string' ? record.code : undefined;
}

function readMessage(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

export function mapFacebookSdkFailure(
  err: unknown,
): FacebookAuthenticationError {
  if (err instanceof FacebookAuthenticationError) return err;
  const code = readCode(err);
  if (/network|connection|internet/i.test(readMessage(err))) {
    return new FacebookAuthenticationError(
      'NETWORK_ERROR',
      'Network error during Facebook sign-in.',
      code ?? 'SDK_NETWORK',
    );
  }
  return new FacebookAuthenticationError(
    'SDK_ERROR',
    'Facebook SDK sign-in failed.',
    code ?? 'SDK_UNKNOWN',
  );
}

export function mapFacebookFirebaseFailure(
  err: unknown,
): FacebookAuthenticationError {
  if (err instanceof FacebookAuthenticationError) return err;
  const code = readCode(err);
  switch (code) {
    case 'auth/account-exists-with-different-credential':
    case 'auth/credential-already-in-use':
    case 'auth/email-already-in-use':
      return new FacebookAuthenticationError(
        'ACCOUNT_CONFLICT',
        'An account already exists with a different sign-in method.',
        code,
      );
    case 'auth/user-mismatch':
      return new FacebookAuthenticationError(
        'USER_MISMATCH',
        'Facebook account does not match the signed-in user.',
        code,
      );
    case 'auth/network-request-failed':
      return new FacebookAuthenticationError(
        'NETWORK_ERROR',
        'Network error during Facebook Firebase exchange.',
        code,
      );
    case 'auth/invalid-credential':
      return new FacebookAuthenticationError(
        'INVALID_CREDENTIAL',
        'Invalid Facebook credential for Firebase.',
        code,
      );
    case 'auth/user-disabled':
      return new FacebookAuthenticationError(
        'USER_DISABLED',
        'Firebase user is disabled.',
        code,
      );
    case 'auth/operation-not-allowed':
      return new FacebookAuthenticationError(
        'NOT_CONFIGURED',
        'Facebook provider is not enabled for this Firebase project.',
        code,
      );
    default:
      return new FacebookAuthenticationError(
        'FIREBASE_ERROR',
        'Firebase Facebook sign-in failed.',
        code ?? 'FIREBASE_UNKNOWN',
      );
  }
}

function logDev(scope: string, err: FacebookAuthenticationError): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[${scope}]`, {
      code: err.code,
      diagnosticCode: err.diagnosticCode,
    });
  }
}

type FacebookTokenDeps = {
  isConfigured: () => boolean;
  requestAccessToken: () => Promise<FacebookAccessTokenResult>;
  /** Drops the native Facebook session after a failed Firebase step. */
  discardProviderSession?: () => void | Promise<void>;
};

async function safeDiscard(deps: FacebookTokenDeps): Promise<void> {
  try {
    await deps.discardProviderSession?.();
  } catch {
    // Idempotent best effort; never masks the original failure.
  }
}

/** Shared: configured check → native login → non-empty access token. */
async function acquireAccessToken(
  deps: FacebookTokenDeps,
  scope: string,
): Promise<string> {
  if (!deps.isConfigured()) {
    const err = new FacebookAuthenticationError(
      'NOT_CONFIGURED',
      'Facebook Login is not configured in this build.',
      'APP_CONFIG_MISSING',
    );
    logDev(scope, err);
    throw err;
  }

  let tokenResult: FacebookAccessTokenResult;
  try {
    tokenResult = await deps.requestAccessToken();
  } catch (err) {
    const mapped = mapFacebookSdkFailure(err);
    logDev(scope, mapped);
    throw mapped;
  }

  const accessToken = tokenResult?.accessToken?.trim() ?? '';
  if (!accessToken) {
    await safeDiscard(deps);
    const err = new FacebookAuthenticationError(
      'TOKEN_MISSING',
      'Facebook Login did not return an access token.',
      'ACCESS_TOKEN_MISSING',
    );
    logDev(scope, err);
    throw err;
  }
  return accessToken;
}

function inProgressError(scope: string): FacebookAuthenticationError {
  const err = new FacebookAuthenticationError(
    'OPERATION_IN_PROGRESS',
    'Facebook sign-in is already in progress.',
    'ORCHESTRATOR_IN_PROGRESS',
  );
  logDev(scope, err);
  return err;
}

export type AuthenticateWithFacebookDeps = FacebookTokenDeps & {
  signInWithAccessToken: (
    accessToken: string,
  ) => Promise<FacebookFirebaseSession>;
  /** Stores the prefill one-shot by UID before returning (CRJ). */
  commitPrefill?: (uid: string, prefill: GoogleProfilePrefill) => void;
};

export function createAuthenticateWithFacebook(
  deps: AuthenticateWithFacebookDeps,
) {
  const scope = 'authenticateWithFacebook';
  let inProgress = false;

  return async function authenticateWithFacebook(): Promise<FacebookAuthenticationResult> {
    if (inProgress) throw inProgressError(scope);
    inProgress = true;
    try {
      const accessToken = await acquireAccessToken(deps, scope);

      let session: FacebookFirebaseSession;
      try {
        session = await deps.signInWithAccessToken(accessToken);
      } catch (err) {
        await safeDiscard(deps);
        const mapped = mapFacebookFirebaseFailure(err);
        logDev(scope, mapped);
        throw mapped;
      }

      const prefill = buildFacebookProfilePrefill(session.identity ?? {});
      if (prefill && deps.commitPrefill && session.uid) {
        try {
          deps.commitPrefill(session.uid, prefill);
        } catch {
          // Fail-soft: auth succeeded; CRJ simply starts without prefill.
        }
      }

      return {
        uid: session.uid,
        email: session.email ?? prefill?.email ?? null,
        ...(prefill ? { prefill } : {}),
      };
    } finally {
      inProgress = false;
    }
  };
}

export type ReauthenticateWithFacebookDeps = FacebookTokenDeps & {
  reauthenticateWithAccessToken: (accessToken: string) => Promise<void>;
};

/** Delete Account: fresh Facebook credential → reauthenticateWithCredential. */
export function createReauthenticateWithFacebook(
  deps: ReauthenticateWithFacebookDeps,
) {
  const scope = 'reauthenticateWithFacebook';
  let inProgress = false;

  return async function reauthenticateWithFacebook(): Promise<void> {
    if (inProgress) throw inProgressError(scope);
    inProgress = true;
    try {
      const accessToken = await acquireAccessToken(deps, scope);
      try {
        await deps.reauthenticateWithAccessToken(accessToken);
      } catch (err) {
        await safeDiscard(deps);
        const mapped = mapFacebookFirebaseFailure(err);
        logDev(scope, mapped);
        throw mapped;
      }
    } finally {
      inProgress = false;
    }
  };
}

/** True when the Firebase user has the facebook.com provider linked. */
export function hasFacebookProvider(
  user: { providerData?: ReadonlyArray<{ providerId?: string | null }> } | null | undefined,
): boolean {
  return (user?.providerData ?? []).some(
    (entry) => entry?.providerId === FACEBOOK_FIREBASE_PROVIDER_ID,
  );
}

/**
 * Delete Account reauth strategy. Password wins when present (existing
 * flow); Facebook-only accounts use Facebook reauth; others keep the
 * existing behavior.
 */
export function resolveDeleteAccountReauthMethod(
  user: { providerData?: ReadonlyArray<{ providerId?: string | null }> } | null | undefined,
): 'password' | 'facebook' | 'other' {
  const ids = (user?.providerData ?? []).map((entry) => entry?.providerId);
  if (ids.includes('password')) return 'password';
  if (ids.includes(FACEBOOK_FIREBASE_PROVIDER_ID)) return 'facebook';
  return 'other';
}
