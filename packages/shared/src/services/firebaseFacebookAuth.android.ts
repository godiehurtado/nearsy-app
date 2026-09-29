/**
 * Android RNFirebase Facebook credential exchange (ENH-AUTH-FB-01).
 *
 * FacebookAuthProvider.credential(accessToken) → signInWithCredential or
 * reauthenticateWithCredential. No account linking, no Firestore writes.
 * Raw Firebase errors propagate; the use case maps them without PII.
 */
import auth from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  extractFacebookIdentity,
  type FacebookFirebaseSession,
} from '../authentication/facebook/facebookAuthCore';

export async function signInWithFacebookAccessToken(
  accessToken: string,
): Promise<FacebookFirebaseSession> {
  const credential = auth.FacebookAuthProvider.credential(accessToken);
  const userCredential = await firebaseAuth.signInWithCredential(credential);
  return {
    uid: userCredential.user.uid,
    email: userCredential.user.email ?? null,
    identity: extractFacebookIdentity({
      user: userCredential.user,
      additionalUserInfo: userCredential.additionalUserInfo
        ? {
            profile: (userCredential.additionalUserInfo.profile ??
              null) as Record<string, unknown> | null,
          }
        : null,
    }),
  };
}

export async function reauthenticateWithFacebookAccessToken(
  accessToken: string,
): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw Object.assign(new Error('No signed-in user to reauthenticate.'), {
      code: 'auth/no-current-user',
    });
  }
  const credential = auth.FacebookAuthProvider.credential(accessToken);
  await user.reauthenticateWithCredential(credential);
}
