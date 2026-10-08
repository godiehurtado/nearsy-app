/**
 * Android RNFirebase provider linking (ENH-AUTH-LINK-01).
 *
 * Provider credential → currentUser.linkWithCredential, only when currentUser
 * is still the UID captured before the provider login. No sign-in, no
 * Firestore writes. Raw Firebase errors propagate; the use cases map them
 * without PII.
 */
import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  ACCOUNT_LINK_USER_CHANGED_CODE,
  toAccountLinkUserSnapshot,
  type AccountLinkUserSnapshot,
} from '../authentication/accountLinking/accountLinkingCore';

export function getAccountLinkUserSnapshot(): AccountLinkUserSnapshot | null {
  return toAccountLinkUserSnapshot(firebaseAuth.currentUser);
}

async function linkCredentialToPinnedUser(
  credential: FirebaseAuthTypes.AuthCredential,
  expectedUid: string,
): Promise<AccountLinkUserSnapshot> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw Object.assign(new Error('No signed-in user to link.'), {
      code: 'auth/no-current-user',
    });
  }
  if (user.uid !== expectedUid) {
    throw Object.assign(new Error('Signed-in user changed before linking.'), {
      code: ACCOUNT_LINK_USER_CHANGED_CODE,
    });
  }
  const result = await user.linkWithCredential(credential);
  const snapshot = toAccountLinkUserSnapshot(result.user);
  if (!snapshot) {
    throw Object.assign(new Error('Linking returned no user.'), {
      code: 'auth/no-current-user',
    });
  }
  return snapshot;
}

export async function linkFacebookAccessTokenToCurrentUser(
  accessToken: string,
  expectedUid: string,
): Promise<AccountLinkUserSnapshot> {
  return linkCredentialToPinnedUser(
    auth.FacebookAuthProvider.credential(accessToken),
    expectedUid,
  );
}

export async function linkGoogleIdTokenToCurrentUser(
  idToken: string,
  expectedUid: string,
): Promise<AccountLinkUserSnapshot> {
  return linkCredentialToPinnedUser(
    auth.GoogleAuthProvider.credential(idToken),
    expectedUid,
  );
}

export async function reloadAccountLinkUser(): Promise<AccountLinkUserSnapshot | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  await user.reload();
  return toAccountLinkUserSnapshot(firebaseAuth.currentUser);
}
