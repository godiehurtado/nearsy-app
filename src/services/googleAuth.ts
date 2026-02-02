// src/services/googleAuth.ts  ✅ RNFirebase-only + standalone redirect (no Expo proxy)
import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import type { AuthRequestPromptOptions } from 'expo-auth-session';
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import Constants from 'expo-constants';

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

type UseGoogleAuthResult = {
  request: any | null; // evita líos de tipos entre provider y core
  signInWithGoogle: (
    options?: AuthRequestPromptOptions,
  ) => Promise<FirebaseAuthTypes.User>;
};

// ✅ Redirect nativo para EAS/standalone (debe existir expo.scheme = "nearsy")
const redirectUri = makeRedirectUri({
  scheme: 'nearsy',
  path: 'redirect',
});

export function useGoogleAuth(): UseGoogleAuthResult {
  const extra = Constants.expoConfig?.extra ?? {};

  const webClientId = extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID as
    | string
    | undefined;

  const iosClientId = extra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID as
    | string
    | undefined;

  const androidClientId = extra.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID as
    | string
    | undefined;

  if (__DEV__) {
    if (!iosClientId && !androidClientId && !webClientId) {
      console.warn(
        '[GoogleAuth] Missing Google client ids in app.json -> extra. Add at least one of: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      );
    }
  }

  const [request, , promptAsync] = Google.useAuthRequest({
    iosClientId,
    androidClientId,
    clientId: webClientId, // fallback

    redirectUri,
    useProxy: false,
    scopes: ['openid', 'profile', 'email'],
    responseType: ResponseType.IdToken,
  });

  const signInWithGoogle = useCallback(
    async (options?: AuthRequestPromptOptions) => {
      try {
        const res = await promptAsync({ useProxy: false, ...options });

        if (res.type !== 'success') {
          throw new Error(
            res.type === 'dismiss' || res.type === 'cancel'
              ? 'Google sign-in cancelled.'
              : 'Google sign-in failed.',
          );
        }

        // expo-auth-session a veces pone id_token en params, además de authentication
        const idToken =
          (res as any)?.authentication?.idToken ??
          (res as any)?.params?.id_token;

        const accessToken = (res as any)?.authentication?.accessToken;

        if (!idToken && !accessToken) {
          throw new Error(
            'Google authentication did not return a valid token.',
          );
        }

        // ✅ RNFirebase credential
        const credential = idToken
          ? auth.GoogleAuthProvider.credential(idToken)
          : auth.GoogleAuthProvider.credential(null, accessToken);

        const userCredential =
          await firebaseAuth.signInWithCredential(credential);

        return userCredential.user;
      } catch (err: any) {
        if (__DEV__) {
          console.error('[GoogleAuth] Sign-in error:', err);
        }
        throw new Error('Google authentication failed. Please try again.');
      }
    },
    [promptAsync],
  );

  return { request, signInWithGoogle };
}
