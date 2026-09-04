// packages/shared/src/App.tsx
import './background/locationTask.android';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { firebaseAuth, firestoreDb } from './config/firebaseConfig';
import { ensureAppCheckInitialized } from './config/appCheckBootstrap';
import { initI18n } from './i18n';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import AppNavigator, { buildNavigationTheme } from './navigation/AppNavigator';
import { ThemeProvider, useAppTheme } from './theme/ThemeContext';

import * as Notifications from 'expo-notifications';
import { registerPushToken } from './services/pushTokens';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from './services/backgroundLocation';

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

/**
 * Holds a neutral surface until the persisted appearance preference is known,
 * so the app never flashes the wrong theme before Theme Selection / Welcome.
 */
function ThemedShell({ i18nReady }: { i18nReady: boolean }) {
  const { theme, palette, hydrating, hasChosenTheme } = useAppTheme();

  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  // RNFirebase: auth state listener — push token registration + BG location.
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async (user: any | null) => {
        if (!user) {
          if (Platform.OS !== 'web') {
            await stopBackgroundLocation().catch(() => {});
          }
          return;
        }

        if (Platform.OS === 'web') return;

        try {
          let bgVisible = false;
          let profileSetupCompleted = false;

          try {
            // RNFirebase Firestore (Android)
            if ((firestoreDb as any)?.collection) {
              const snap = await (firestoreDb as any)
                .collection('users')
                .doc(user.uid)
                .get();
              const data = snap?.exists ? snap.data() : null;
              bgVisible = !!data?.bgVisible;
              profileSetupCompleted = data?.profileSetupCompleted === true;
            } else {
              // Web SDK Firestore (iOS)
              const { doc, getDoc } = await import('firebase/firestore');
              const ref = doc(firestoreDb as any, 'users', user.uid);
              const snap = await getDoc(ref);
              const data = snap.exists() ? snap.data() : null;
              bgVisible = !!data?.bgVisible;
              profileSetupCompleted = data?.profileSetupCompleted === true;
            }
          } catch (e) {
            if (__DEV__) console.warn('[App] BG location read error:', e);
          }

          // CRJ: do not request notification permission during onboarding.
          // Incomplete users grant (or skip) via ProfileCompletion educational step.
          // Complete users register the token here on session restore.
          if (profileSetupCompleted) {
            try {
              await registerPushToken();
            } catch (e) {
              if (__DEV__) console.warn('[App] registerPushToken error:', e);
            }
          }

          if (bgVisible) {
            await startBackgroundLocation({ uid: user.uid });
          } else {
            await stopBackgroundLocation().catch(() => {});
          }
        } catch (e) {
          if (__DEV__) console.warn('[App] BG location start/stop error:', e);
        }
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {});

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

  if (!i18nReady || hydrating) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const navTheme = buildNavigationTheme(theme, palette);

  return (
    <>
      <StatusBar
        style={
          !hasChosenTheme ? 'dark' : theme === 'dark' ? 'light' : 'dark'
        }
      />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [i18nReady, setI18nReady] = useState(false);

  // App Check must be ready before future identity Functions callables.
  // Non-blocking: skip/error must not prevent Google/email/Firestore startup.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    ensureAppCheckInitialized()
      .then((status) => {
        if (cancelled || !__DEV__) return;
        if (status.status === 'error') {
          console.warn('[App] App Check init error:', status.message);
        } else if (status.status === 'ready') {
          console.log(
            '[App] App Check ready:',
            status.decision.action === 'use_debug'
              ? 'debug'
              : status.decision.action === 'use_play_integrity'
                ? 'playIntegrity'
                : status.decision.action,
          );
        }
      })
      .catch((e) => {
        if (!cancelled && __DEV__) {
          console.warn('[App] App Check bootstrap unexpected error:', e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    initI18n()
      .catch((e) => {
        if (__DEV__) console.warn('[App] initI18n error:', e);
      })
      .finally(() => {
        if (!cancelled) setI18nReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedShell i18nReady={i18nReady} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
