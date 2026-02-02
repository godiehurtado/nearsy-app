// App.tsx (RNFirebase-only)
import './src/background/locationTask';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

import { firebaseAuth, firestoreDb } from './src/config/firebaseConfig';

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

// ===== Handler global de notificaciones =====
Notifications.setNotificationHandler({
  handleNotification:
    async (): Promise<Notifications.NotificationBehavior> => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
});

// ===== Android: canal por defecto =====
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export const navigationRef = createNavigationContainerRef();

export default function App() {
  // 1) Canal Android
  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  // 2) RNFirebase: auth state listener
  useEffect(() => {
    // ✅ RNFirebase auth listener
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
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
        if (__DEV__) console.warn('[App] registerPushToken error:', e);
      }

      // b) background location según preferencia (bgVisible)
      if (Platform.OS === 'web') return;

      try {
        const snap = await firestoreDb.collection('users').doc(user.uid).get();
        const bgVisible = snap.exists ? !!snap.data()?.bgVisible : false;

        if (bgVisible) {
          await startBackgroundLocation({ uid: user.uid });
        } else {
          await stopBackgroundLocation().catch(() => {});
        }
      } catch (e) {
        if (__DEV__) console.warn('[App] BG location start/stop error:', e);
      }
    });

    return () => unsubscribe();
  }, []);

  // 3) Listeners de notificaciones
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // opcional: refrescar data o mostrar toast
    });

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
