// src/services/googleAuth.ts
import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import type { AuthRequest, AuthRequestPromptOptions } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential, User } from 'firebase/auth';
import Constants from 'expo-constants';
import { auth } from '../config/firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

type UseGoogleAuthResult = {
  request: AuthRequest | null;
  signInWithGoogle: (options?: AuthRequestPromptOptions) => Promise<User>;
};

// 🔥 redirectUri quemado según configuración actual
const redirectUri = 'https://auth.expo.io/@godie.hurtado/nearsy-app';

export function useGoogleAuth(): UseGoogleAuthResult {
  const extra = Constants.expoConfig?.extra ?? {};
  const webClientId = extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID as
    | string
    | undefined;

  if (!webClientId && __DEV__) {
    console.warn(
      '[GoogleAuth] Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in app.json -> extra',
    );
  }

  const [request, , promptAsync] = Google.useAuthRequest({
    clientId: webClientId,
    redirectUri,
    useProxy: true,
    scopes: ['openid', 'profile', 'email'],
  });

  const signInWithGoogle = useCallback(
    async (options?: AuthRequestPromptOptions) => {
      try {
        const res = await promptAsync({ useProxy: true, ...options });

        if (res.type !== 'success') {
          throw new Error(
            res.type === 'dismiss' || res.type === 'cancel'
              ? 'Google sign-in cancelled.'
              : 'Google sign-in failed.',
          );
        }

        const { authentication } = res;

        if (!authentication?.idToken && !authentication?.accessToken) {
          throw new Error(
            'Google authentication did not return a valid token.',
          );
        }

        const credential = authentication.idToken
          ? GoogleAuthProvider.credential(authentication.idToken)
          : GoogleAuthProvider.credential(
              null,
              authentication.accessToken ?? undefined,
            );

        const userCredential = await signInWithCredential(auth, credential);
        return userCredential.user;
      } catch (err: any) {
        if (__DEV__) {
          console.error('[GoogleAuth] Sign-in error:', err);
        }

        // Sanitizar mensaje para producción
        throw new Error('Google authentication failed. Please try again.');
      }
    },
    [promptAsync],
  );

  return { request, signInWithGoogle };
}
