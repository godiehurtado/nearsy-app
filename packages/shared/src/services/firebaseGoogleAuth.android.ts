/**
 * Android RNFirebase Google credential exchange (TS-007).
 *
 * Encapsulates GoogleAuthProvider.credential + signInWithCredential.
 * Does not touch UI, navigation, Firestore, Google SDK, or account linking.
 */
import auth from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig.android';

export type FirebaseGoogleAuthResult = {
  uid: string;
  email: string | null;
};

export type FirebaseGoogleAuthErrorCode =
  | 'NETWORK_ERROR'
  | 'INVALID_CREDENTIAL'
  | 'USER_DISABLED'
  | 'UNKNOWN';

export class FirebaseGoogleAuthError extends Error {
  readonly code: FirebaseGoogleAuthErrorCode;
  readonly firebaseCode?: string;

  constructor(
    code: FirebaseGoogleAuthErrorCode,
    message: string,
    firebaseCode?: string,
  ) {
    super(message);
    this.name = 'FirebaseGoogleAuthError';
    this.code = code;
    this.firebaseCode = firebaseCode;
  }
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

function mapFirebaseError(err: unknown): FirebaseGoogleAuthError {
  const firebaseCode = readFirebaseCode(err);

  if (firebaseCode === 'auth/network-request-failed') {
    return new FirebaseGoogleAuthError(
      'NETWORK_ERROR',
      'Network error during Google Firebase sign-in.',
      firebaseCode,
    );
  }

  if (
    firebaseCode === 'auth/invalid-credential' ||
    firebaseCode === 'auth/invalid-id-token' ||
    firebaseCode === 'auth/invalid-custom-token'
  ) {
    return new FirebaseGoogleAuthError(
      'INVALID_CREDENTIAL',
      'Invalid Google credential for Firebase sign-in.',
      firebaseCode,
    );
  }

  if (firebaseCode === 'auth/user-disabled') {
    return new FirebaseGoogleAuthError(
      'USER_DISABLED',
      'Firebase user is disabled.',
      firebaseCode,
    );
  }

  return new FirebaseGoogleAuthError(
    'UNKNOWN',
    'Firebase Google sign-in failed.',
    firebaseCode,
  );
}

/**
 * Exchange a Google ID token for a Firebase Auth session.
 * Does not log or return the token.
 */
export async function signInWithGoogleIdToken(
  idToken: string,
): Promise<FirebaseGoogleAuthResult> {
  const trimmed = idToken?.trim();
  if (!trimmed) {
    throw new FirebaseGoogleAuthError(
      'INVALID_CREDENTIAL',
      'Missing Google ID token for Firebase sign-in.',
    );
  }

  try {
    const credential = auth.GoogleAuthProvider.credential(trimmed);
    const userCredential = await firebaseAuth.signInWithCredential(credential);
    const user = userCredential.user;

    return {
      uid: user.uid,
      email: user.email ?? null,
    };
  } catch (err) {
    if (err instanceof FirebaseGoogleAuthError) {
      throw err;
    }
    throw mapFirebaseError(err);
  }
}
