/**
 * Android RNFirebase Facebook account linking (ENH-AUTH-LINK-01).
 *
 * FacebookAuthProvider.credential(accessToken) → currentUser.linkWithCredential,
 * only when currentUser is still the UID captured before Facebook login.
 * No sign-in, no Firestore writes. Raw Firebase errors propagate; the use case
 * maps them without PII.
 */
import auth from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  FACEBOOK_LINK_USER_CHANGED_CODE,
  toFacebookLinkUserSnapshot,
  type FacebookLinkUserSnapshot,
} from '../authentication/facebook/facebookAccountLinking';

export function getFacebookLinkUserSnapshot(): FacebookLinkUserSnapshot | null {
  return toFacebookLinkUserSnapshot(firebaseAuth.currentUser);
}

export async function linkFacebookAccessTokenToCurrentUser(
  accessToken: string,
  expectedUid: string,
): Promise<FacebookLinkUserSnapshot> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw Object.assign(new Error('No signed-in user to link.'), {
      code: 'auth/no-current-user',
    });
  }
  if (user.uid !== expectedUid) {
    throw Object.assign(new Error('Signed-in user changed before linking.'), {
      code: FACEBOOK_LINK_USER_CHANGED_CODE,
    });
  }
  const credential = auth.FacebookAuthProvider.credential(accessToken);
  const result = await user.linkWithCredential(credential);
  const snapshot = toFacebookLinkUserSnapshot(result.user);
  if (!snapshot) {
    throw Object.assign(new Error('Linking returned no user.'), {
      code: 'auth/no-current-user',
    });
  }
  return snapshot;
}

export async function reloadFacebookLinkUser(): Promise<FacebookLinkUserSnapshot | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  await user.reload();
  return toFacebookLinkUserSnapshot(firebaseAuth.currentUser);
}
