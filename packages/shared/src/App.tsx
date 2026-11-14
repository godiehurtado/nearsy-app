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
import { applyPostAuthNavigation } from './phoneOtp/applyPostAuthNavigation';
import { getSharedLinkedInA3DurableStore } from './authentication/linkedinA3/runtimeDurableStore';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
} from '@react-navigation/native';
import AppNavigator, { buildNavigationTheme } from './navigation/AppNavigator';
import { navigationRef } from './navigation/rootNavigationRef';
import { AppUpdateNoticeHost } from './appUpdateNotice/AppUpdateNoticeHost';
import { ThemeProvider, useAppTheme } from './theme/ThemeContext';

import * as Notifications from 'expo-notifications';
import { createPushOpenCoordinator } from './alerts/pushOpenCoordinator';
import { notePushAlertOpened } from './alerts/alertSeenSync';
import { trackAlertOpened } from './analytics';
import { startAnalyticsRuntime } from './analytics/runtime';
import {
  createReevaluatePendingPort,
  resumePendingReevaluateProximityNotices,
  scheduleReevaluateProximityNotices,
} from './alerts/reevaluateProximityNotices';
import {
  refreshVerifiedActorKeysFlow,
} from './contacts/controller';
import { contactsOperationRunner } from './contacts/contactsOperationCoordinator';
import { getContactsHmacClient } from './contacts/iosContactsFoundation';
import { createContactsSessionStore } from './contacts/iosContactsSession';
import { registerRefreshVerifiedActorKeysInvoker } from './contacts/refreshActorKeys';
import { syncPushTokenForAuthUser } from './services/pushTokens';
import { stopBackgroundLocationRuntime, syncBackgroundLocationRuntime } from './visibility/backgroundLocationRuntime';
import { clearLocationPermissionJourneySession, reconcileLocationJourneyOnColdStart } from './visibility/locationPermissionJourney';

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

export { navigationRef } from './navigation/rootNavigationRef';

const pushOpenCoordinator = createPushOpenCoordinator({
  // Profiles live in MainTabs; login and onboarding stacks cannot show them.
  canNavigate: () =>
    navigationRef.isReady() &&
    !!navigationRef
      .getRootState()
      ?.routes.some((route) => route.name === 'MainTabs'),
  navigateToProfile: (uid) => {
    (navigationRef as any).navigate('Home', {
      screen: 'DiscoveryProfile',
      params: { uid },
    });
    // QA 2.1.0 (same rule as Android): a push reads its alert only when its
    // detail actually opens; resolved once the alert is listed. The
    // coordinator navigates only with a signed-in session in MainTabs.
    const viewerUid = firebaseAuth.currentUser?.uid;
    if (viewerUid) notePushAlertOpened(viewerUid, uid, Date.now());
  },
  onAlertOpened: ({ alertId, motive }) => {
    trackAlertOpened({ source: 'push', alertId, motive });
  },
  now: () => Date.now(),
});

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
          accountSignal: result.accountSignal,
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
          void applyPostAuthNavigation(
            {
              reset: (state) => {
                (navigationRef as any).reset(state);
              },
            },
            {
              uid: finalized.session.uid,
              email: finalized.email ?? finalized.session.email ?? '',
            },
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
    startAnalyticsRuntime();
    startAffiliationEntitySearchBootstrap();
  }, []);

  useEffect(() => {
    ensureAndroidChannel();
  }, []);

  useEffect(() => {
    // Ephemeral journey locks must never survive cold start / Metro reload.
    reconcileLocationJourneyOnColdStart();
  }, []);

  useEffect(() => {
    let lastUid: string | null = null;
    const unsubscribe = firebaseAuth.onAuthStateChanged(
      async (user: any | null) => {
        const previousUid = lastUid;
        lastUid = user?.uid ?? null;
        pushOpenCoordinator.setSession(lastUid);

        if (previousUid && previousUid !== lastUid) {
          // Contacts intents and the stored epoch never outlive the session.
          contactsOperationRunner.invalidate(previousUid);
          void createContactsSessionStore(previousUid)
            .forgetEpoch()
            .catch(() => {});
        }
        if (user) {
          // A marker left by this account survives other accounts on the device.
          void resumePendingReevaluateProximityNotices();
        }

        if (!user) {
          // Logout: More / Delete Account already released under A.
          // Generation bump discards in-flight registers; do not write.
          await syncPushTokenForAuthUser(previousUid, null);
          if (Platform.OS !== 'web') {
            await stopBackgroundLocationRuntime().catch(() => {});
          }
          clearLocationPermissionJourneySession();
          return;
        }

        if (previousUid && previousUid !== user.uid) {
          // Direct A→B (email / Google / Apple / Facebook / LinkedIn custom
          // token): session is already B, so Firestore owner rules forbid
          // deleting users/A/pushTokens/{token}. Release ran before the
          // session-replacing sign-in. Listener only registers B.
          clearLocationPermissionJourneySession();
        }

        try {
          await syncPushTokenForAuthUser(previousUid, user.uid);
        } catch (e) {
          if (__DEV__) console.warn('[App] syncPushTokenForAuthUser error:', e);
        }

        if (Platform.OS === 'web') return;

        try {
          let bgVisible = false;
          let visibilityOn = false;

          try {
            if ((firestoreDb as any)?.collection) {
              const snap = await (firestoreDb as any)
                .collection('users')
                .doc(user.uid)
                .get();
              if (snap?.exists) {
                const data = snap.data() ?? {};
                bgVisible = !!data.bgVisible;
                visibilityOn = !!data.visibility;
              }
            } else {
              const { doc, getDoc } = await import('firebase/firestore');
              const ref = doc(firestoreDb as any, 'users', user.uid);
              const snap = await getDoc(ref);
              if (snap.exists()) {
                const data = snap.data() ?? {};
                bgVisible = !!data.bgVisible;
                visibilityOn = !!data.visibility;
              }
            }
          } catch (e) {
            if (__DEV__) console.warn('[App] BG location read error:', e);
          }

          await syncBackgroundLocationRuntime({
            uid: user.uid,
            visibilityOn,
            bgVisible,
          });
        } catch (e) {
          if (__DEV__) console.warn('[App] BG location start/stop error:', e);
        }
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {});

    registerRefreshVerifiedActorKeysInvoker(async () => {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      // Serialized with More Settings enable/sync/disable for this UID so the
      // session epoch is never written by two Identity calls at once.
      await contactsOperationRunner.run(uid, 'refresh', async () => {
        const client = await getContactsHmacClient();
        const session = createContactsSessionStore(uid);
        return refreshVerifiedActorKeysFlow({
          client,
          session,
          reevaluatePending: createReevaluatePendingPort(uid),
          // The controller keeps a prior pending mark on "nothing changed".
          // Reevaluate failure must not invalidate a confirmed Identity sync.
          afterIdentity: async () => {
            scheduleReevaluateProximityNotices();
          },
        });
      }).promise;
    });

    void resumePendingReevaluateProximityNotices();

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        pushOpenCoordinator.handleResponse(response);
      },
    );
    // A tap that launched the app; the coordinator ignores a repeat of it.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => pushOpenCoordinator.handleResponse(response))
      .catch(() => {});

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
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={pushOpenCoordinator.flush}
        onStateChange={pushOpenCoordinator.flush}
      >
        <LinkedInA3ResumeBridge />
        <AppUpdateNoticeHost />
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
