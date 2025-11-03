// App.tsx
import './src/background/locationTask'; // registra la Task al boot (import temprano)
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from './src/config/firebaseConfig';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';

import * as Notifications from 'expo-notifications';
import { registerPushToken } from './src/services/pushTokens';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from './src/services/backgroundLocation';

import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

// ===== Handler global de notificaciones (también en foreground) =====
Notifications.setNotificationHandler({
  handleNotification:
    async (): Promise<Notifications.NotificationBehavior> => ({
      // comportamiento clásico
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      // campos recientes (no en todos los SO/SDK)
      shouldShowBanner: true,
      shouldShowList: true,
    }),
});

// ===== Android: crear canal por defecto (una vez) =====
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// ===== Ref de navegación para abrir pantallas desde taps de push =====
export const navigationRef = createNavigationContainerRef();

export default function App() {
  // 1) Canal Android
  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  // 2) Registrar token push y controlar background location según sesión/preferencia
  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) {
        if (Platform.OS !== 'web') {
          await stopBackgroundLocation().catch(() => {});
        }
        return;
      }

      // a) token push
      try {
        await registerPushToken();
      } catch (e) {
        console.warn('registerPushToken error:', e);
      }

      // b) background location según preferencia del usuario (bgVisible)
      if (Platform.OS === 'web') return;
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        const bgVisible = snap.exists() ? !!snap.data()?.bgVisible : false;
        if (bgVisible) {
          await startBackgroundLocation({ uid: user.uid });
        } else {
          await stopBackgroundLocation().catch(() => {});
        }
      } catch (e) {
        console.warn('BG location start/stop error:', e);
      }
    });

    return () => unsub();
  }, []);

  // 3) Listeners (foreground + tap) — opcional refrescar UI si quieres
  useEffect(() => {
    // recibido en foreground (ya se muestra banner por el handler)
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // aquí podrías disparar un toast o un refetch si hace falta
    });

    // El usuario tocó la notificación
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as any;
        const actorUid = data?.actorUid;

        if (actorUid && navigationRef.isReady()) {
          (navigationRef as any).navigate('Home', {
            screen: 'ProfileDetail',
            params: { uid: actorUid },
          });
        }
      },
    );

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
