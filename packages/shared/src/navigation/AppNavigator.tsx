// src/navigation/AppNavigator.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  Platform,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  DarkTheme,
  DefaultTheme,
  Theme as NavigationTheme,
} from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import ProfileCompletionScreen from '../screens/ProfileCompletionScreen';
import PhoneVerificationScreen from '../screens/PhoneVerificationScreen';
import IntroVideoScreen from '../screens/IntroVideoScreen';
import ThemeSelectionScreen from '../screens/ThemeSelectionScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import InterestsScreen from '../screens/InterestsScreen';
import SocialMediaScreen from '../screens/SocialMediaScreen';
import GalleryScreen from '../screens/GalleryScreen';
import AffiliationsScreen from '../screens/AffiliationsScreen';
import RootTabs from './RootTabs';
import { RootStackParamList } from './types';
import { useAppTheme } from '../theme/ThemeContext';

import { firebaseAuth } from '../config/firebaseConfig';
import { dbGetUser, dbOnUserSnapshot } from '../services/db';
import { loadHasSeenWelcome } from '../onboarding/welcomeStorage';
import {
  createAuthenticatedProfileGate,
  isAuthenticatedProfileLoading,
  PROFILE_GATE_I18N_KEYS,
  type AuthenticatedProfileFlow,
} from './profileGate';

export type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function FullScreenLoader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function ProfileGateErrorView(props: {
  reason: 'permission_denied' | 'transient';
  onRetry: () => void;
  backgroundColor: string;
  textColor: string;
  primaryColor: string;
}) {
  const { t } = useTranslation();
  const message =
    props.reason === 'permission_denied'
      ? t(PROFILE_GATE_I18N_KEYS.permissionDeniedMessage)
      : t(PROFILE_GATE_I18N_KEYS.errorMessage);

  return (
    <View
      style={[
        styles.errorRoot,
        { backgroundColor: props.backgroundColor },
      ]}
    >
      <Text style={[styles.errorTitle, { color: props.textColor }]}>
        {t(PROFILE_GATE_I18N_KEYS.errorTitle)}
      </Text>
      <Text style={[styles.errorBody, { color: props.textColor }]}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={props.onRetry}
        style={[styles.retryBtn, { backgroundColor: props.primaryColor }]}
      >
        <Text style={styles.retryLabel}>
          {t(PROFILE_GATE_I18N_KEYS.retry)}
        </Text>
      </Pressable>
    </View>
  );
}

function guestScreenOptions(backgroundColor: string) {
  return {
    headerShown: false,
    contentStyle: { backgroundColor },
  } as const;
}

function guestInitialRoute(
  hasChosenTheme: boolean,
  hasSeenWelcome: boolean,
): keyof RootStackParamList {
  if (!hasChosenTheme) return 'ThemeSelection';
  if (!hasSeenWelcome) return 'Welcome';
  return 'Login';
}

export default function AppNavigator() {
  const { palette, hasChosenTheme, hydrating } = useAppTheme();

  const [authLoading, setAuthLoading] = useState(true);
  const [welcomeHydrating, setWelcomeHydrating] = useState(true);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);

  const [uid, setUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [profileFlow, setProfileFlow] = useState<AuthenticatedProfileFlow>({
    kind: 'loading',
  });

  const gateRef = useRef(
    createAuthenticatedProfileGate({
      listen: dbOnUserSnapshot,
      get: dbGetUser,
    }),
  );

  useEffect(() => {
    let alive = true;
    loadHasSeenWelcome()
      .then((seen) => {
        if (alive) setHasSeenWelcome(seen);
      })
      .finally(() => {
        if (alive) setWelcomeHydrating(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 1) Auth
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      try {
        if (!user) {
          setUid(null);
          setUserEmail(null);
          setProfileFlow({ kind: 'loading' });
          return;
        }

        try {
          await user.reload();
        } catch {}

        const refreshedUser = firebaseAuth.currentUser;

        // iOS requires verified email; Android auth proceeds straight to profile setup.
        if (
          !refreshedUser ||
          (Platform.OS === 'ios' && !refreshedUser.emailVerified)
        ) {
          setUid(null);
          setUserEmail(null);
          setProfileFlow({ kind: 'loading' });
          return;
        }

        setUid(refreshedUser.uid);
        setUserEmail(refreshedUser.email ?? null);
      } catch {
        setUid(null);
        setUserEmail(null);
        setProfileFlow({ kind: 'loading' });
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2) Profile gate (shared by Google / password / LinkedIn — no provider branch)
  useEffect(() => {
    const gate = gateRef.current;
    if (!uid) {
      gate.stop();
      setProfileFlow({ kind: 'loading' });
      return;
    }

    gate.start(uid, setProfileFlow);
    return () => {
      gate.stop();
    };
  }, [uid]);

  const retryProfileGate = () => {
    if (!uid) return;
    gateRef.current.retry(uid, setProfileFlow);
  };

  // Guests must not wait on profile-gate loading (no uid → no profile to load).
  const profileLoading = isAuthenticatedProfileLoading(uid, profileFlow.kind);
  const needsCompleteProfile = profileFlow.kind === 'ProfileCompletion';
  const profileReadError =
    profileFlow.kind === 'profile_read_error' ? profileFlow : null;

  // Guest key must NOT flip when hasChosenTheme becomes true on Continue —
  // otherwise the stack remounts and races with navigation.replace('Welcome').
  // hasSeenWelcome is also excluded: marking Welcome seen mid-session must not remount.
  const flowKey = useMemo(() => {
    if (authLoading || profileLoading || hydrating || welcomeHydrating)
      return 'loading';
    if (!uid) return 'guest';
    if (profileReadError) return `auth-error-${uid}`;
    if (needsCompleteProfile) return `auth-complete-${uid}`;
    return `auth-main-${uid}`;
  }, [
    authLoading,
    profileLoading,
    hydrating,
    welcomeHydrating,
    uid,
    needsCompleteProfile,
    profileReadError,
  ]);

  if (authLoading || profileLoading || hydrating || welcomeHydrating) {
    return <FullScreenLoader />;
  }

  /**
   * Guest flow (v1.1 Experience Foundation):
   *   Launch -> ThemeSelection (first run only; replace() to Welcome)
   *          -> Welcome (first launch only) -> Login | Register | Google
   *   Later cold starts (Welcome already seen) -> Login
   */
  if (!uid) {
    return (
      <Stack.Navigator
        id="RootGuest"
        key={flowKey}
        initialRouteName={guestInitialRoute(hasChosenTheme, hasSeenWelcome)}
        screenOptions={guestScreenOptions(palette.background)}
      >
        <Stack.Screen
          name="ThemeSelection"
          component={ThemeSelectionScreen}
          options={{ gestureEnabled: false, animation: 'fade' }}
        />
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="IntroVideo" component={IntroVideoScreen} />
        <Stack.Screen
          name="ProfileCompletion"
          component={ProfileCompletionScreen}
        />
        <Stack.Screen
          name="CompleteProfile"
          component={CompleteProfileScreen}
        />
        <Stack.Screen
          name="PhoneVerification"
          component={PhoneVerificationScreen}
        />
        <Stack.Screen name="MainTabs" component={RootTabs} />
        <Stack.Screen name="Interests" component={InterestsScreen} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
        <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
        <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
      </Stack.Navigator>
    );
  }

  if (profileReadError) {
    return (
      <ProfileGateErrorView
        reason={profileReadError.reason}
        onRetry={retryProfileGate}
        backgroundColor={palette.background}
        textColor={palette.textPrimary}
        primaryColor={palette.primary}
      />
    );
  }

  // J02 routing foundation: incomplete → ProfileCompletion (existing CRJ screens).
  // Phone OTP (J03) / full DOB-CRJ (J04) remain downstream — do not fake Home.
  if (needsCompleteProfile) {
    return (
      <Stack.Navigator
        id="RootAuthenticatedComplete"
        key={`auth-complete-${uid}`}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen
          name="ProfileCompletion"
          component={ProfileCompletionScreen}
          initialParams={{ uid, email: userEmail }}
        />
        <Stack.Screen
          name="CompleteProfile"
          component={CompleteProfileScreen}
          initialParams={{ uid, email: userEmail }}
        />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainTabs" component={RootTabs} />
        <Stack.Screen name="Interests" component={InterestsScreen} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
        <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
        <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      id="RootAuthenticatedMain"
      key={`auth-main-${uid}`}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="MainTabs" component={RootTabs} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="Gallery" component={GalleryScreen} />
      <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
      <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
    </Stack.Navigator>
  );
}

/** Builds a React Navigation theme from the active app palette. */
export function buildNavigationTheme(
  theme: 'clear' | 'dark',
  palette: {
    background: string;
    cardBg: string;
    textPrimary: string;
    primary: string;
    border: string;
  },
): NavigationTheme {
  const base = theme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: palette.background,
      card: palette.cardBg,
      text: palette.textPrimary,
      primary: palette.primary,
      border: palette.border,
    },
  };
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorBody: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.85,
    marginBottom: 24,
    lineHeight: 22,
  },
  retryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
