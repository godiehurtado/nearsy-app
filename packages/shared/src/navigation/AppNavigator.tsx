// src/navigation/AppNavigator.tsx
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import OnboardingBirthDateScreen from '../screens/OnboardingBirthDateScreen';
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
import { clearCrjVisibilityActivationHandoff } from '../visibility/crjVisibilityActivationHandoff';
import {
  closeVisibilitySessionGate,
  openVisibilitySessionGate,
} from '../visibility/visibilitySessionGate';
import {
  acknowledgeAuthUserForAccountDeletion,
  getAccountDeletionClosure,
  isAccountClosedByDeletion,
  isAccountDeletionSessionActive,
  subscribeAccountDeletionClosure,
} from '../services/accountDeletionSession';
import { resolveProfileSubscriptionUid, resolveRootFlowKind } from './rootFlowDecision';

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

  const accountClosure = useSyncExternalStore(
    subscribeAccountDeletionClosure,
    getAccountDeletionClosure,
  );
  const profileUid = resolveProfileSubscriptionUid(uid, accountClosure);

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
      acknowledgeAuthUserForAccountDeletion(user?.uid ?? null);
      try {
        if (!user) {
          closeVisibilitySessionGate();
          clearActiveProfileModeConfirmation();
          // Drop CRJ provisional so a later session never inherits Active.
          clearCrjVisibilityActivationHandoff('logout');
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

        // A deleted account must not reopen Visibility while it signs out.
        if (isAccountClosedByDeletion(refreshedUser.uid)) return;

        openVisibilitySessionGate(refreshedUser.uid);
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

  // 2) Profile — never for an account closed by deletion.
  useEffect(() => {
    if (!profileUid) {
      setProfileLoading(false);
      setNeedsCompleteProfile(false);
      return;
    }

    setProfileLoading(true);

    const userRef = doc(firestoreDb, 'users', profileUid);

    const unsubscribe = onSnapshot(
      userRef,
      async (snap) => {
        // Snapshots already queued when the closure barrier engaged.
        if (isAccountClosedByDeletion(profileUid)) return;
        if (!snap.exists() && isAccountDeletionSessionActive()) {
          // users/{uid} is removed before Auth delete. Do not remount into
          // CompleteProfile and tear down DeleteAccount mid-flow.
          setNeedsCompleteProfile(false);
          setProfileLoading(false);
          return;
        }
        const data = snap.exists() ? (snap.data() as any) : null;
        setNeedsCompleteProfile(!isProfileDocumentComplete(data));
        setOnboardingInitialRoute(resolveAuthenticatedStackInitialRoute(data));
        setProfileLoading(false);
      },
      async () => {
        if (isAccountClosedByDeletion(profileUid)) return;
        if (isAccountDeletionSessionActive()) {
          setNeedsCompleteProfile(false);
          setProfileLoading(false);
          return;
        }
        try {
          const snap = await getDoc(userRef);
          if (isAccountClosedByDeletion(profileUid)) return;
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
  }, [profileUid]);

  const rootFlow = resolveRootFlowKind({
    loading: authLoading || profileLoading || hydrating || welcomeHydrating,
    uid,
    needsCompleteProfile,
    closure: accountClosure,
  });

  // Guest key must NOT flip when hasChosenTheme becomes true on Continue —
  // otherwise the stack remounts and races with navigation.replace('Welcome').
  // hasSeenWelcome is also excluded: marking Welcome seen mid-session must not remount.
  const flowKey = useMemo(() => {
    if (rootFlow === 'loading' || rootFlow === 'guest') return rootFlow;
    return `${rootFlow}-${uid}`;
  }, [rootFlow, uid]);

  if (rootFlow === 'loading') {
    return <FullScreenLoader />;
  }

  /**
   * Guest flow (v1.1 Experience Foundation):
   *   Launch -> ThemeSelection (first run only; replace() to Welcome)
   *          -> Welcome (first launch only) -> Login | Register | Google
   *   Later cold starts (Welcome already seen) -> Login
   */
  if (rootFlow === 'guest' || !uid) {
    return (
      <Stack.Navigator
        id="RootGuest"
        key={flowKey}
        initialRouteName={
          accountClosure ? 'Login' : guestInitialRoute(hasChosenTheme, hasSeenWelcome)
        }
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
          name="OnboardingBirthDate"
          component={OnboardingBirthDateScreen}
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
        key={`auth-complete-${uid}`}
        initialRouteName={onboardingInitialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen
          name="OnboardingBirthDate"
          component={OnboardingBirthDateScreen}
          initialParams={{ uid, email: userEmail, inputNonce: Date.now() }}
        />
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
