// src/services/googleAuth.ts
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  signInWithCredential,
  getAuth,
} from 'firebase/auth';

WebBrowser.maybeCompleteAuthSession();

const IDS = {
  web: '557470198780-8ls8o304sfcf8va409va90o6rar3vc5a.apps.googleusercontent.com',
  android:
    '557470198780-1l8p3r2rpeik05a87t44t2g1iv9lbb8j.apps.googleusercontent.com', // 👈 NUEVO (exacto)
  ios: '557470198780-9qe3qg59h682e3fn14ic97hf9t375m3n.apps.googleusercontent.com',
};

const REDIRECTS = {
  android:
    'com.googleusercontent.apps.557470198780-1l8p3r2rpeik05a87t44t2g1iv9lbb8j:/oauthredirect', // 👈 NUEVO (exacto)
  ios: 'com.googleusercontent.apps.557470198780-9qe3qg59h682e3fn14ic97hf9t375m3n:/oauthredirect',
  scheme: 'nearsy:/oauthredirect',
};

export function useGoogleAuth() {
  const redirectUri =
    Platform.OS === 'android'
      ? REDIRECTS.android
      : Platform.OS === 'ios'
      ? REDIRECTS.ios
      : REDIRECTS.scheme;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: IDS.web,
    androidClientId: IDS.android,
    iosClientId: IDS.ios,
    redirectUri, // sin proxy
  });

  const signInWithGoogle = async () => {
    const res = await promptAsync();
    if (res.type !== 'success' || !res.params?.id_token) {
      throw new Error('Google sign-in canceled or failed');
    }
    const cred = GoogleAuthProvider.credential(res.params.id_token);
    const user = (await signInWithCredential(getAuth(), cred)).user;
    return user;
  };

  return { request, response, promptAsync, signInWithGoogle };
}
