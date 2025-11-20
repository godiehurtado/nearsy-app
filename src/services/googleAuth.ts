// src/services/googleAuth.ts
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import {
  GoogleAuthProvider,
  signInWithCredential,
  getAuth,
} from 'firebase/auth';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// **ATENCIÓN: Usa los IDs de Cliente de tu Consola (Captura 3)**

// 1. Cliente Web (Tipo "Web application", necesario para el ID Token)
const WEB_CLIENT_ID =
  '557470198780-8ls8o304sfcf8va409va90o6rar3vc5a.apps.googleusercontent.com';

// 2. Cliente Android (Tipo "Android", necesario para el proxy de Android)
const ANDROID_CLIENT_ID =
  '557470198780-mm5ok68jl6kortcfk88h4k9op3e34ch1.apps.googleusercontent.com'; // **Reemplaza con tu ID Android real**

// 3. Cliente iOS (Tipo "iOS", necesario para el proxy de iOS)
const IOS_CLIENT_ID =
  '557470198780-9qe3qg59h682e3fn14ic97hf9t375m3n.apps.googleusercontent.com'; // **Reemplaza con tu ID iOS real**

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    // Siempre usaremos el Cliente WEB para que Google sepa qué API Key usar
    clientId: WEB_CLIENT_ID,

    // **Estos son CRUCIALES para el modo Expo Go/Proxy**
    // Indican a Expo cómo generar las URLs de redirección correctas para el proxy.
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
  });

  const signInWithGoogle = async () => {
    // ⚠️ CAMBIA useProxy: true por useProxy: false ⚠️
    // Esto obliga a usar la redirección nativa, evitando el servidor proxy de Expo.
    const res = await (promptAsync as any)({ useProxy: false });

    if (res.type !== 'success' || !res.params?.id_token) {
      // Manejar el error de cancelación o fallo
      throw new Error('Google sign-in canceled or failed');
    }

    // 1. Crear la credencial de Firebase con el ID Token
    const credential = GoogleAuthProvider.credential(res.params.id_token);

    // 2. Iniciar sesión en Firebase
    const user = (await signInWithCredential(getAuth(), credential)).user;

    return user;
  };

  return { request, response, signInWithGoogle };
}
