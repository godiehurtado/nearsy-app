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
    '557470198780-mm5ok68jl6kortcfk88h4k9op3e34ch1.apps.googleusercontent.com',
  ios: '557470198780-9qe3qg59h682e3fn14ic97hf9t375m3n.apps.googleusercontent.com',
};

const REDIRECTS = {
  android:
    'com.googleusercontent.apps.557470198780-mm5ok68jl6kortcfk88h4k9op3e34ch1:/oauthredirect',
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
  console.log(redirectUri);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: IDS.web, // Web Client ID
    androidClientId: IDS.android,
    iosClientId: IDS.ios,
    redirectUri, // esto fuerza NO usar proxy
  });

  const signInWithGoogle = async () => {
    const res = await promptAsync();
    if (res.type !== 'success' || !res.params?.id_token)
      throw new Error('Google sign-in canceled or failed');

    const credential = GoogleAuthProvider.credential(res.params.id_token);
    const user = (await signInWithCredential(getAuth(), credential)).user;
    return user;
  };

  return { request, response, promptAsync, signInWithGoogle };
}
