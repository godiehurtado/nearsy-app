// src/services/appleAuth.ts  ✅ RNFirebase-only (iOS-only)
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig';

async function signInWithAppleIOS(): Promise<FirebaseAuthTypes.User> {
  // 1) Generar nonce y su hash (Apple exige nonce hasheado en la petición)
  const rawNonce = Math.random().toString(36).substring(2);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  // 2) Lanzar Apple Sign-In nativo
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

  // 3) Convertir a credencial de RNFirebase
  const credential = auth.AppleAuthProvider.credential(
    result.identityToken,
    rawNonce,
  );

  // 4) Login en Firebase (RNFirebase)
  const userCredential = await firebaseAuth.signInWithCredential(credential);
  return userCredential.user;
}

export async function signInWithApple() {
  // ✅ iOS-only (estable). Android queda deshabilitado explícitamente.
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is currently available only on iOS.');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  return signInWithAppleIOS();
}
