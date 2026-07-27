/**
 * LEGACY — deferred retirement (Apple Authentication local phase).
 *
 * Do not wire Login/Welcome to this module. Production Sign in with Apple
 * uses `authentication/social` (Apple provider adapter + authenticateWithApple).
 * Keep this file until a dedicated cleanup task removes unused callers/exports.
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { OAuthProvider, User } from 'firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig';

async function signInWithAppleIOS(): Promise<User> {
  // 1) Nonce + hash
  const rawNonce = Math.random().toString(36).substring(2);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  // 2) Apple Sign-In nativo (identityToken)
  const result = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!result.identityToken) {
    throw new Error('No identity token returned by Apple.');
  }

  // 3) Firebase credential (Web SDK) para apple.com
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: result.identityToken,
    rawNonce,
  });

  // 4) Login con Web SDK Auth
  const userCredential = await firebaseAuth.signInWithCredential(credential);
  return userCredential.user;
}

export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is currently available only on iOS.');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  return signInWithAppleIOS();
}
