// src/navigation/AppNavigator.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import PhoneVerificationScreen from '../screens/PhoneVerificationScreen';
import IntroVideoScreen from '../screens/IntroVideoScreen';
import InterestsScreen from '../screens/InterestsScreen';
import SocialMediaScreen from '../screens/SocialMediaScreen';
import GalleryScreen from '../screens/GalleryScreen';
import AffiliationsScreen from '../screens/AffiliationsScreen';
import RootTabs from './RootTabs';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export type RootStackParamList = {
  IntroVideo: undefined;
  Login: undefined;
  Register: undefined;
  CompleteProfile:
    | {
        uid: string;
        email?: string | null;
      }
    | undefined;
  MainTabs: undefined;
  PhoneVerification: {
    uid: string;
    phone: string;
    from?: string;
  };

  Interests: any;
  Gallery: any;
  Affiliations: any;
  SocialMedia: any;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function FullScreenLoader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

// function hasCompleteProfile(data: any): boolean {
//   if (!data) return false;

//   const realNameOk =
//     typeof data.realName === 'string' && data.realName.trim().length > 0;

//   const modeOk = data.mode === 'personal' || data.mode === 'professional';

//   const profileImageOk =
//     typeof data.profileImage === 'string' &&
//     data.profileImage.trim().length > 0;

//   return realNameOk && modeOk && profileImageOk;
// }

function hasCompleteProfile(data: any): boolean {
  if (!data) return false;

  if (data.profileSetupCompleted === true) return true;

  const realNameOk =
    typeof data.realName === 'string' && data.realName.trim().length > 0;

  const modeOk = data.mode === 'personal' || data.mode === 'professional';

  const profileImageOk =
    typeof data.profileImage === 'string' &&
    data.profileImage.trim().length > 0;

  return realNameOk && modeOk && profileImageOk;
}

export default function AppNavigator() {
  const INTRO_VIDEO_KEY = 'hasSeenIntroVideo';

  const [introLoading, setIntroLoading] = useState(true);
  const [hasSeenIntroVideo, setHasSeenIntroVideo] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const [uid, setUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [needsCompleteProfile, setNeedsCompleteProfile] = useState(false);

  useEffect(() => {
    const loadIntroFlag = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(INTRO_VIDEO_KEY);
        setHasSeenIntroVideo(storedValue === 'true');
      } catch {
        setHasSeenIntroVideo(false);
      } finally {
        setIntroLoading(false);
      }
    };

    loadIntroFlag();
  }, []);

  // 1) Auth
  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      try {
        if (!user) {
          setUid(null);
          setUserEmail(null);
          setNeedsCompleteProfile(false);
          return;
        }

        try {
          await user.reload();
        } catch {}

        const refreshedUser = firebaseAuth.currentUser;

        // ✅ Email verification required on ALL platforms
        if (!refreshedUser || !refreshedUser.emailVerified) {
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
        setNeedsCompleteProfile(!hasCompleteProfile(data));
        setProfileLoading(false);
      },
      async () => {
        try {
          const snap = await getDoc(userRef);
          const data = snap.exists() ? (snap.data() as any) : null;
          setNeedsCompleteProfile(!hasCompleteProfile(data));
        } catch {
          setNeedsCompleteProfile(false);
        } finally {
          setProfileLoading(false);
        }
      },
    );

    return () => unsubscribe();
  }, [uid]);

  const authenticatedInitialRoute = useMemo<keyof RootStackParamList>(() => {
    if (needsCompleteProfile) return 'CompleteProfile';
    return 'MainTabs';
  }, [needsCompleteProfile]);

  const flowKey = useMemo(() => {
    if (authLoading || profileLoading) return 'loading';
    if (!uid) return 'guest';
    if (needsCompleteProfile) return `auth-complete-${uid}`;
    return `auth-main-${uid}`;
  }, [authLoading, profileLoading, uid, needsCompleteProfile]);

  if (authLoading || profileLoading || introLoading) {
    return <FullScreenLoader />;
  }

  if (!hasSeenIntroVideo) {
    return (
      <Stack.Navigator
        key="intro-video"
        initialRouteName="IntroVideo"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="IntroVideo" component={IntroVideoScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
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

  return !uid ? (
    <Stack.Navigator key={flowKey} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="IntroVideo" component={IntroVideoScreen} />
      <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
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
  ) : (
    <Stack.Navigator
      key={flowKey}
      initialRouteName={authenticatedInitialRoute}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="MainTabs" component={RootTabs} />
      <Stack.Screen
        name="CompleteProfile"
        component={CompleteProfileScreen}
        initialParams={{ uid, email: userEmail }}
      />

      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="Gallery" component={GalleryScreen} />
      <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
      <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
    </Stack.Navigator>
  );
}
