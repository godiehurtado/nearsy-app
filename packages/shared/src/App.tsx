// packages/shared/src/App.tsx
import './background/locationTask';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Linking, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { firebaseAuth, firestoreDb } from './config/firebaseConfig';
import { initI18n, useTranslation } from './i18n';
import { startAffiliationEntitySearchBootstrap } from './affiliations/iosAffiliationEntitySearchBootstrap';
import { attachLinkedInA3AppRootResume } from './authentication/linkedinA3/appRootResume';
import {
  createLinkedInA3FirebaseAuthPort,
  finalizeLinkedInA3AuthenticatedSession,
  isLinkedInA3SignInEnabledForRuntime,
} from './authentication/linkedinA3/authenticateWithLinkedIn';
import { getLinkedInA3CallableClient } from './authentication/linkedinA3/iosLinkedInA3Foundation';
import { resetNavigationAfterLinkedInA3SignIn } from './authentication/linkedinA3/linkedinA3Navigation';
import { getSharedLinkedInA3DurableStore } from './authentication/linkedinA3/runtimeDurableStore';

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

function LinkedInA3ResumeBridge() {
  const { t } = useTranslation();

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!isLinkedInA3SignInEnabledForRuntime()) return;

    let cancelled = false;

    const detach = attachLinkedInA3AppRootResume({
      linking: Linking,
      resumeDeps: {
        durableStore: getSharedLinkedInA3DurableStore(),
        getClient: getLinkedInA3CallableClient,
        auth: createLinkedInA3FirebaseAuthPort(),
      },
      onResult: async (result) => {
        if (cancelled || result.status === 'skipped') return;

        if (result.status !== 'authenticated') {
          if (
            result.status === 'expired' ||
            result.status === 'failed' ||
            result.status === 'provider_error'
          ) {
            Alert.alert(
              t('authentication.login.alerts.loginErrorTitle'),
              t('authentication.social.errors.generic'),
            );
          }
          return;
        }

        const finalized = await finalizeLinkedInA3AuthenticatedSession({
          uid: result.session.uid,
          sessionEmail: result.session.email,
          profileHints: result.profileHints,
        });
        if (cancelled) return;
        if (finalized.status !== 'authenticated') {
          Alert.alert(
            t('authentication.login.alerts.loginErrorTitle'),
            t('authentication.social.errors.generic'),
          );
          return;
        }
        if (!navigationRef.isReady()) return;
        Keyboard.dismiss();
        setTimeout(() => {
          if (cancelled || !navigationRef.isReady()) return;
          resetNavigationAfterLinkedInA3SignIn(
            {
              reset: (state) => {
                (navigationRef as any).reset(state);
              },
            },
            finalized,
          );
        }, 150);
      },
    });

    return () => {
      cancelled = true;
      detach();
    };
  }, [t]);

  return null;
}

/**
 * Holds a neutral surface until the persisted appearance preference is known,
 * so the app never flashes the wrong theme before Theme Selection / Welcome.
 */
function ThemedShell({ i18nReady }: { i18nReady: boolean }) {
  const { theme, palette, hydrating, hasChosenTheme } = useAppTheme();

  useEffect(() => {
    startAffiliationEntitySearchBootstrap();
  }, []);

  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async (user: any | null) => {
        if (!user) {
          if (Platform.OS !== 'web') {
            await stopBackgroundLocation().catch(() => {});
          }
          return;
        }

        try {
          await registerPushToken();
        } catch (e) {
          if (__DEV__) console.warn('[App] registerPushToken error:', e);
        }

        if (Platform.OS === 'web') return;

        try {
          let bgVisible = false;

          try {
            if ((firestoreDb as any)?.collection) {
              const snap = await (firestoreDb as any)
                .collection('users')
                .doc(user.uid)
                .get();
              bgVisible = snap?.exists ? !!snap.data()?.bgVisible : false;
            } else {
              const { doc, getDoc } = await import('firebase/firestore');
              const ref = doc(firestoreDb as any, 'users', user.uid);
              const snap = await getDoc(ref);
              bgVisible = snap.exists() ? !!snap.data()?.bgVisible : false;
            }
          } catch (e) {
            if (__DEV__) console.warn('[App] BG location read error:', e);
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
        <LinkedInA3ResumeBridge />
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [i18nReady, setI18nReady] = useState(false);

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
