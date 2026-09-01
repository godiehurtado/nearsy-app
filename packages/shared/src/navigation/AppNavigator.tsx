// src/navigation/AppNavigator.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  DarkTheme,
  DefaultTheme,
  Theme as NavigationTheme,
} from '@react-navigation/native';

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
import ProfileGalleryScreen from '../screens/ProfileGalleryScreen';
import AffiliationsScreen from '../screens/AffiliationsScreen';
import RootTabs from './RootTabs';
import { RootStackParamList } from './types';
import { useAppTheme } from '../theme/ThemeContext';
import { clearActiveProfileModeConfirmation } from '../visibility/activeProfileModeSync';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { isProfileDocumentComplete } from '../utils/profileDocumentComplete';
import { loadHasSeenWelcome } from '../onboarding/welcomeStorage';
import {
  resolveAuthenticatedStackInitialRoute,
  type AuthenticatedOnboardingStackRoute,
} from '../phoneOtp/onboardingResolver';

export type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function FullScreenLoader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [welcomeHydrating, setWelcomeHydrating] = useState(true);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);

  const [uid, setUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [needsCompleteProfile, setNeedsCompleteProfile] = useState(false);
  const [onboardingInitialRoute, setOnboardingInitialRoute] =
    useState<AuthenticatedOnboardingStackRoute>('ProfileCompletion');

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
          clearActiveProfileModeConfirmation();
          setUid(null);
          setUserEmail(null);
          setNeedsCompleteProfile(false);
          return;
        }

        try {
          await user.reload();
        } catch {}

        const refreshedUser = firebaseAuth.currentUser;

        // TEMP: Email verification temporarily disabled (iOS) — restore gate below.
        const requireEmailVerified = Platform.OS !== 'ios';
        if (
          requireEmailVerified &&
          (!refreshedUser || !refreshedUser.emailVerified)
        ) {
          setUid(null);
          setUserEmail(null);
          setNeedsCompleteProfile(false);
          return;
        }

        setUid(refreshedUser.uid);
        setUserEmail(refreshedUser.email ?? null);
      } catch {
        setUid(null);
        setUserEmail(null);
        setNeedsCompleteProfile(false);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2) Profile
  useEffect(() => {
    if (!uid) {
      setProfileLoading(false);
      setNeedsCompleteProfile(false);
      return;
    }

    setProfileLoading(true);

    const userRef = doc(firestoreDb, 'users', uid);

    const unsubscribe = onSnapshot(
      userRef,
      async (snap) => {
        const data = snap.exists() ? (snap.data() as any) : null;
        setNeedsCompleteProfile(!isProfileDocumentComplete(data));
        setOnboardingInitialRoute(resolveAuthenticatedStackInitialRoute(data));
        setProfileLoading(false);
      },
      async () => {
        try {
          const snap = await getDoc(userRef);
          const data = snap.exists() ? (snap.data() as any) : null;
          setNeedsCompleteProfile(!isProfileDocumentComplete(data));
          setOnboardingInitialRoute(resolveAuthenticatedStackInitialRoute(data));
        } catch {
          setNeedsCompleteProfile(false);
        } finally {
          setProfileLoading(false);
        }
      },
    );

    return () => unsubscribe();
  }, [uid]);

  // Guest key must NOT flip when hasChosenTheme becomes true on Continue —
  // otherwise the stack remounts and races with navigation.replace('Welcome').
  // hasSeenWelcome is also excluded: marking Welcome seen mid-session must not remount.
  const flowKey = useMemo(() => {
    if (authLoading || profileLoading || hydrating || welcomeHydrating)
      return 'loading';
    if (!uid) return 'guest';
    if (needsCompleteProfile) return `auth-complete-${uid}`;
    return `auth-main-${uid}`;
  }, [
    authLoading,
    profileLoading,
    hydrating,
    welcomeHydrating,
    uid,
    needsCompleteProfile,
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
        <Stack.Screen name="ProfileGallery" component={ProfileGalleryScreen} />
        <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
        <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
      </Stack.Navigator>
    );
  }

  if (needsCompleteProfile) {
    return (
      <Stack.Navigator
        id="RootAuthenticatedComplete"
        key={`auth-complete-${uid}-${onboardingInitialRoute}`}
        initialRouteName={onboardingInitialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen
          name="PhoneVerification"
          component={PhoneVerificationScreen}
          initialParams={{ uid, from: 'onboarding' }}
        />
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
        <Stack.Screen name="ProfileGallery" component={ProfileGalleryScreen} />
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
      <Stack.Screen name="ProfileGallery" component={ProfileGalleryScreen} />
      <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
      <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
    </Stack.Navigator>
  );
}

/** Builds a React Navigation theme from the active app palette. */
export function buildNavigationTheme(
  theme: 'clear' | 'dark',
  palette: { background: string; cardBg: string; textPrimary: string; primary: string; border: string },
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
