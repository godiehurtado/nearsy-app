// src/services/appleAuth.ts
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  makeRedirectUri,
  AuthRequest,
  ResponseType,
  DiscoveryDocument,
} from 'expo-auth-session';
import * as AuthSession from 'expo-auth-session';
import { OAuthProvider, signInWithCredential, getAuth } from 'firebase/auth';

const SERVICE_ID =
  process.env.EXPO_PUBLIC_APPLE_SERVICE_ID || 'YOUR_APPLE_SERVICE_ID';
// ej: "com.nearsy.app.signin" (Service ID en Apple Developer)

const OWNER = 'godie.hurtado';
const SLUG = 'nearsy-app';

// Redirect para Android (flujo web). IMPORTANTÍSIMO: este debe estar registrado en tu Service ID en Apple.
const PROXY_REDIRECT = makeRedirectUri({
  scheme: 'nearsy',
  path: 'redirect', // no es obligatorio; makeRedirectUri generará la URL del proxy
});

const discovery = {
  authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
  tokenEndpoint: 'https://appleid.apple.com/auth/token',
  revocationEndpoint: 'https://appleid.apple.com/auth/revoke',
};

async function signInWithAppleIOS() {
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

  // 3) Intercambiar por credencial de Firebase
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: result.identityToken,
    rawNonce,
  });

  const user = (await signInWithCredential(getAuth(), credential)).user;
  return user;
}

async function signInWithAppleAndroidWeb() {
  // Nonce requerido por Apple
  const rawNonce = Math.random().toString(36).slice(2);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  // Usa el proxy de Expo de forma compatible con todas las versiones
  const redirectUri = AuthSession.getRedirectUrl();
  // => https://auth.expo.io/@godie.hurtado/nearsy-app  (en dev/expo)

  const discovery: DiscoveryDocument = {
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    revocationEndpoint: 'https://appleid.apple.com/auth/revoke',
  };

  const request = new AuthRequest({
    clientId: SERVICE_ID, // ej. com.nearsy.app.signin
    responseType: ResponseType.IdToken, // MUY importante
    redirectUri, // proxy de Expo
    scopes: ['name', 'email'],
    extraParams: {
      response_mode: 'form_post', // Apple lo exige para id_token
      nonce: hashedNonce,
    },
  });

  // Lanza el flujo (sin pasar opciones; usa redirectUri de arriba)
  const result = await request.promptAsync(discovery);

  if (result.type !== 'success' || !('id_token' in (result.params || {}))) {
    throw new Error('Apple sign-in was canceled or failed.');
  }

  const idToken = (result.params as any).id_token as string;

  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken, rawNonce });

  const user = (await signInWithCredential(getAuth(), credential)).user;
  return user;
}

export async function signInWithApple() {
  if (Platform.OS === 'ios') {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available)
      throw new Error('Sign in with Apple is not available on this device.');
    return signInWithAppleIOS();
  }
  // Android: flujo web
  return signInWithAppleAndroidWeb();
}
