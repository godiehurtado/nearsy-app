/**
 * SPIKE / PoC ONLY — LinkedIn via Firebase-managed OIDC (Alternative A2).
 *
 * Uses RNFirebase namespaced API already used by Android Google auth:
 *   new auth.OAuthProvider('oidc.linkedin')
 *   firebaseAuth.signInWithPopup(provider)
 * which bridges to Android startActivityForSignInWithProvider + Custom Tab.
 *
 * Does NOT: AuthSession, WebBrowser OAuth, manual code exchange, Client Secret,
 * Firestore writes, CRJ integration, account linking, or Google path changes.
 */
import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { firebaseAuth } from '../config/firebaseConfig';
import {
  clearLinkedInOidcPocResult,
  maskUid,
  setLinkedInOidcPocResult,
  type LinkedInOidcPocSanitizedResult,
} from './linkedinOidcPocResultStore';

export const LINKEDIN_OIDC_PROVIDER_ID = 'oidc.linkedin';

const MIN_SCOPES = ['openid', 'profile', 'email'] as const;

export type LinkedInOidcPocErrorCode =
  | 'NOT_ANDROID'
  | 'POC_DISABLED'
  | 'WRONG_FIREBASE_ENV'
  | 'IN_PROGRESS'
  | 'CANCELLED'
  | 'ACCOUNT_EXISTS'
  | 'OPERATION_NOT_ALLOWED'
  | 'NETWORK'
  | 'INVALID_CREDENTIAL'
  | 'UNKNOWN';

export class LinkedInOidcPocError extends Error {
  readonly code: LinkedInOidcPocErrorCode;
  readonly firebaseCode?: string;

  constructor(
    code: LinkedInOidcPocErrorCode,
    message: string,
    firebaseCode?: string,
  ) {
    super(message);
    this.name = 'LinkedInOidcPocError';
    this.code = code;
    this.firebaseCode = firebaseCode;
  }
}

let inProgress = false;

export function isLinkedInOidcPocEnabled(): boolean {
  if (Platform.OS !== 'android') return false;
  if (!__DEV__) return false;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  // Build must have been produced with NEARSY_FIREBASE_ENV=development
  return (
    extra.nearsyFirebaseEnv === 'development' &&
    extra.nearsyLinkedInOidcPoc === true
  );
}

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

function mapFirebaseError(err: unknown): LinkedInOidcPocError {
  const firebaseCode = readFirebaseCode(err);
  const msg =
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
      ? sanitizeErrorMessage((err as { message: string }).message)
      : 'LinkedIn OIDC PoC failed.';

  if (
    firebaseCode === 'auth/user-cancelled' ||
    firebaseCode === 'auth/cancelled-popup-request' ||
    firebaseCode === 'auth/popup-closed-by-user' ||
    /cancel/i.test(String(firebaseCode ?? '')) ||
    /cancel/i.test(msg)
  ) {
    return new LinkedInOidcPocError('CANCELLED', 'User cancelled.', firebaseCode);
  }

  if (firebaseCode === 'auth/account-exists-with-different-credential') {
    return new LinkedInOidcPocError(
      'ACCOUNT_EXISTS',
      'Account exists with a different credential. No merge performed.',
      firebaseCode,
    );
  }

  if (firebaseCode === 'auth/operation-not-allowed') {
    return new LinkedInOidcPocError(
      'OPERATION_NOT_ALLOWED',
      'OIDC provider not enabled or not allowed for this Firebase app.',
      firebaseCode,
    );
  }

  if (firebaseCode === 'auth/network-request-failed') {
    return new LinkedInOidcPocError(
      'NETWORK',
      'Network error during LinkedIn OIDC.',
      firebaseCode,
    );
  }

  if (
    firebaseCode === 'auth/invalid-credential' ||
    firebaseCode === 'auth/invalid-cert-hash' ||
    firebaseCode === 'auth/unauthorized-domain'
  ) {
    return new LinkedInOidcPocError(
      'INVALID_CREDENTIAL',
      'Invalid provider credential or app configuration.',
      firebaseCode,
    );
  }

  return new LinkedInOidcPocError('UNKNOWN', msg, firebaseCode);
}

function sanitizeErrorMessage(raw: string): string {
  // Strip anything that looks like a JWT / bearer / long opaque token.
  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]')
    .slice(0, 240);
}

function collectProfileKeys(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object') return [];
  return Object.keys(profile as Record<string, unknown>).sort();
}

function buildSuccessResult(userCredential: any): LinkedInOidcPocSanitizedResult {
  const user = userCredential?.user;
  const additional = userCredential?.additionalUserInfo;
  const providerData = Array.isArray(user?.providerData) ? user.providerData : [];
  const providerIds = providerData
    .map((p: { providerId?: string }) => p?.providerId)
    .filter(Boolean) as string[];

  const profileKeys = collectProfileKeys(additional?.profile);

  return {
    outcome: 'success',
    at: Date.now(),
    firebaseUidMasked: maskUid(user?.uid),
    isNewUser:
      typeof additional?.isNewUser === 'boolean' ? additional.isNewUser : null,
    providerIds,
    emailPresent: typeof user?.email === 'string' && user.email.length > 0,
    emailVerified:
      typeof user?.emailVerified === 'boolean' ? user.emailVerified : null,
    displayNamePresent:
      typeof user?.displayName === 'string' && user.displayName.trim().length > 0,
    photoUrlPresent:
      typeof user?.photoURL === 'string' && user.photoURL.trim().length > 0,
    localePresent: profileKeys.includes('locale'),
    additionalProfileKeys: profileKeys,
    providerDataCount: providerData.length,
    note:
      'PoC only — no Firestore profile write; CRJ may still route on auth state.',
  };
}

/**
 * Starts Firebase-managed LinkedIn OIDC (oidc.linkedin).
 * Pending Custom Tab results are recovered inside RNFirebase native
 * signInWithProvider via getPendingAuthResult().
 */
export async function signInWithLinkedInOidcPoc(): Promise<LinkedInOidcPocSanitizedResult> {
  if (Platform.OS !== 'android') {
    throw new LinkedInOidcPocError('NOT_ANDROID', 'PoC is Android-only.');
  }
  if (!isLinkedInOidcPocEnabled()) {
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
    if (extra.nearsyFirebaseEnv !== 'development') {
      throw new LinkedInOidcPocError(
        'WRONG_FIREBASE_ENV',
        'Rebuild Development Client with NEARSY_FIREBASE_ENV=development (eas profile development-nearsy-dev).',
      );
    }
    throw new LinkedInOidcPocError(
      'POC_DISABLED',
      'LinkedIn OIDC PoC is disabled for this build.',
    );
  }
  if (inProgress) {
    throw new LinkedInOidcPocError(
      'IN_PROGRESS',
      'LinkedIn OIDC PoC already in progress.',
    );
  }

  inProgress = true;
  try {
    // Namespaced API matching firebaseGoogleAuth.android.ts style.
    const provider = new auth.OAuthProvider(LINKEDIN_OIDC_PROVIDER_ID);
    for (const scope of MIN_SCOPES) {
      provider.addScope(scope);
    }

    // signInWithPopup → native signInWithProvider → Custom Tab (A2).
    // Do NOT use OIDCAuthProvider.credential (that is manual ID-token / A1).
    const userCredential = await firebaseAuth.signInWithPopup(provider);
    const result = buildSuccessResult(userCredential);
    setLinkedInOidcPocResult(result);
    return result;
  } catch (err) {
    if (err instanceof LinkedInOidcPocError) {
      const failed: LinkedInOidcPocSanitizedResult = {
        outcome: err.code === 'CANCELLED' ? 'cancelled' : 'failed',
        at: Date.now(),
        errorCode: err.firebaseCode ?? err.code,
        errorMessageSanitized: err.message,
      };
      setLinkedInOidcPocResult(failed);
      throw err;
    }
    const mapped = mapFirebaseError(err);
    const failed: LinkedInOidcPocSanitizedResult = {
      outcome: mapped.code === 'CANCELLED' ? 'cancelled' : 'failed',
      at: Date.now(),
      errorCode: mapped.firebaseCode ?? mapped.code,
      errorMessageSanitized: mapped.message,
    };
    setLinkedInOidcPocResult(failed);
    throw mapped;
  } finally {
    inProgress = false;
  }
}

export async function signOutLinkedInOidcPoc(): Promise<void> {
  try {
    await firebaseAuth.signOut();
  } finally {
    clearLinkedInOidcPocResult();
  }
}

export function formatLinkedInOidcPocSummary(
  result: LinkedInOidcPocSanitizedResult,
): string {
  const lines = [
    `outcome: ${result.outcome}`,
    result.firebaseUidMasked ? `uid: ${result.firebaseUidMasked}` : null,
    result.isNewUser === null || result.isNewUser === undefined
      ? null
      : `isNewUser: ${result.isNewUser}`,
    result.providerIds ? `providers: ${result.providerIds.join(', ') || '(none)'}` : null,
    `emailPresent: ${result.emailPresent ?? false}`,
    `emailVerified: ${result.emailVerified ?? 'n/a'}`,
    `displayNamePresent: ${result.displayNamePresent ?? false}`,
    `photoUrlPresent: ${result.photoUrlPresent ?? false}`,
    `localePresent: ${result.localePresent ?? false}`,
    `providerDataCount: ${result.providerDataCount ?? 0}`,
    result.additionalProfileKeys?.length
      ? `additionalProfileKeys: ${result.additionalProfileKeys.join(', ')}`
      : 'additionalProfileKeys: (none)',
    result.errorCode ? `errorCode: ${result.errorCode}` : null,
    result.errorMessageSanitized
      ? `error: ${result.errorMessageSanitized}`
      : null,
    result.note ?? null,
  ].filter(Boolean);
  return lines.join('\n');
}
