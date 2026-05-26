// src/screens/InterestsScreen.tsx ✅ RNFirebase-only
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import TopHeader from '../components/TopHeader';
import GuideOnboardingCard from '../components/GuideOnboardingCard';
import InterestsWithLogo from '../components/InterestsWithLogo';
import { GUIDE_AUDIO } from '../constants/guideAudioAssets';
import { useGuideAudio } from '../hooks/useGuideAudio';
import type { InterestAffiliations, InterestLabel } from '../types/profile';
import { getUserProfile } from '../services/firestoreService';

type ProfileMode = 'personal' | 'professional';

type RouteParams = {
  mode?: ProfileMode;
  uid?: string;
  personalAff?: InterestAffiliations;
  professionalAff?: InterestAffiliations;
};

const INTERESTS_SETUP_STEPS = [
  {
    title: 'Select a category',
    description: 'Tap any interest category to get started.',
    audio: null,
  },
  {
    title: 'Select your interests',
    description: 'Choose one or more icons for this category.',
    audio: GUIDE_AUDIO.interests.selectInterests,
  },
  {
    title: 'Tap Done',
    description: 'Tap Done when you have finished selecting icons.',
    audio: GUIDE_AUDIO.interests.tapDone,
  },
  {
    title: 'Save interests',
    description: 'Tap Save interests to continue.',
    audio: GUIDE_AUDIO.interests.save,
  },
];

export default function InterestsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const params = (route.params ?? {}) as RouteParams;
  const mode: ProfileMode =
    params.mode === 'professional' ? 'professional' : 'personal';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [openedGuideCategory, setOpenedGuideCategory] =
    useState<InterestLabel | null>(null);
  const [interestsModalOpen, setInterestsModalOpen] = useState(false);
  const onboardingActive =
    isSetupMode && !onboardingCompleted && !loading;

  const showOnboardingGuideOutside =
    onboardingActive && (onboardingStep === 0 || onboardingStep === 3);

  const showOnboardingGuideInModal =
    onboardingActive &&
    interestsModalOpen &&
    (onboardingStep === 1 || onboardingStep === 2);
  const { playAudio, stopAudio } = useGuideAudio();
  const currentSetupStep = INTERESTS_SETUP_STEPS[onboardingStep];

  useEffect(() => {
    if (!onboardingActive) {
      void stopAudio();
      return;
    }
    void playAudio(currentSetupStep?.audio);
  }, [onboardingActive, onboardingStep, currentSetupStep?.audio, playAudio, stopAudio]);

  const completeOnboarding = useCallback(() => {
    setOnboardingCompleted(true);
    void stopAudio();
  }, [stopAudio]);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);

  const [personalAff, setPersonalAff] = useState<InterestAffiliations>({});
  const [professionalAff, setProfessionalAff] = useState<InterestAffiliations>(
    {},
  );

  const currentAff = mode === 'personal' ? personalAff : professionalAff;
  const setCurrentAff =
    mode === 'personal' ? setPersonalAff : setProfessionalAff;

  const handleOnboardingBack = () => {
    if (onboardingStep === 1) {
      setOpenedGuideCategory(null);
      setOnboardingStep(0);
      return;
    }

    if (onboardingStep === 2) {
      setOnboardingStep(1);
    }
  };

  const handleOnboardingNext = () => {
    if (onboardingStep !== 1) return;

    const category = openedGuideCategory;
    const picks =
      category && Array.isArray(currentAff[category])
        ? currentAff[category]!
        : [];

    if (picks.length === 0) {
      Alert.alert(
        'One more thing',
        'Please select at least one interest in this category.',
      );
      return;
    }

    setOnboardingStep(2);
  };

  const title = useMemo(
    () => `${mode === 'personal' ? 'Personal' : 'Professional'} Interests`,
    [mode],
  );

  const modalGuideCard = showOnboardingGuideInModal ? (
    <Animated.View
      entering={FadeInDown.duration(350)}
      style={styles.modalGuideCard}
    >
      <GuideOnboardingCard
        stepIndex={onboardingStep}
        totalSteps={INTERESTS_SETUP_STEPS.length}
        title={currentSetupStep.title}
        description={currentSetupStep.description}
        showBack={onboardingStep === 1 || onboardingStep === 2}
        showNext={onboardingStep === 1}
        onBack={handleOnboardingBack}
        onNext={handleOnboardingNext}
        onSkip={completeOnboarding}
      />
    </Animated.View>
  ) : null;

  const cleanAffiliations = (aff: InterestAffiliations): InterestAffiliations =>
    Object.fromEntries(
      Object.entries(aff ?? {}).filter(
        ([, arr]) => Array.isArray(arr) && arr.length > 0,
      ),
    ) as InterestAffiliations;

  const labelsFromAff = (aff: InterestAffiliations): string[] =>
    Object.keys(aff ?? {});

  const handleSave = async () => {
    try {
      setSaving(true);

      const uid = params.uid || firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      if (mode === 'personal') {
        const clean = cleanAffiliations(personalAff);
        const labels = labelsFromAff(clean);

        await firestoreDb
          .collection('users')
          .doc(uid)
          .set(
            {
              personalInterests: labels,
              personalInterestAffiliations: clean,
              updatedAt: Date.now(),
            },
            { merge: true },
          );
      } else {
        const clean = cleanAffiliations(professionalAff);
        const labels = labelsFromAff(clean);

        await firestoreDb
          .collection('users')
          .doc(uid)
          .set(
            {
              professionalInterests: labels,
              professionalInterestAffiliations: clean,
              updatedAt: Date.now(),
            },
            { merge: true },
          );
      }

      Alert.alert('Saved', 'Your interests were updated.');
      navigation.goBack();
    } catch (e: any) {
      if (__DEV__) {
        console.error('[InterestsScreen] Error saving interests', e);
      }

      Alert.alert('Error', e?.message || 'Could not save interests.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const uid = params.uid || firebaseAuth.currentUser?.uid;
        if (!uid) throw new Error('User not authenticated.');

        const existing = await getUserProfile(uid);

        if (!existing) {
          setIsSetupMode(true);
          setPersonalAff(params.personalAff ?? {});
          setProfessionalAff(params.professionalAff ?? {});

          setTopBarColor('#3B5A85');
          setTopBarMode('color');
          setTopBarImage(null);
          setProfileImage(null);
          return;
        }

        setIsSetupMode(
          (existing as { profileSetupCompleted?: boolean }).profileSetupCompleted !==
            true,
        );

        setPersonalAff(
          (existing as any)?.personalInterestAffiliations ??
            params.personalAff ??
            {},
        );

        setProfessionalAff(
          (existing as any)?.professionalInterestAffiliations ??
            params.professionalAff ??
            {},
        );

        setTopBarColor((existing as any)?.topBarColor || '#3B5A85');
        setTopBarMode(
          (existing as any)?.topBarMode ||
            ((existing as any)?.topBarImage ? 'image' : 'color'),
        );
        setTopBarImage((existing as any)?.topBarImage || null);
        setProfileImage((existing as any)?.profileImage || null);
      } catch (e: any) {
        if (__DEV__) {
          console.error('[InterestsScreen] Error loading interests', e);
        }

        setPersonalAff(params.personalAff ?? {});
        setProfessionalAff(params.professionalAff ?? {});

        setTopBarColor('#3B5A85');
        setTopBarMode('color');
        setTopBarImage(null);
        setProfileImage(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
        <Text style={styles.loaderText}>Loading interests…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: keyboardVisible
              ? keyboardHeight + insets.bottom + 88
              : insets.bottom + 88,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <TopHeader
            topBarMode={topBarMode}
            topBarColor={topBarColor}
            topBarImage={topBarImage}
            profileImage={profileImage}
            leftIcon="chevron-back"
            onLeftPress={() => navigation.goBack()}
            showAvatar
          />

          <Text style={styles.headerTitle}>{title}</Text>

          <View style={{ flex: 1, padding: 16 }}>
            <InterestsWithLogo
              value={currentAff}
              onChange={setCurrentAff}
              scope={mode}
              editable={true}
              setupGuideActive={onboardingActive}
              setupGuideStep={onboardingStep}
              modalGuideCard={modalGuideCard}
              onSetupModalOpenChange={setInterestsModalOpen}
              onSetupCategoryOpened={(interest) => {
                setOpenedGuideCategory(interest);
                setOnboardingStep(1);
              }}
              onSetupModalDone={() => setOnboardingStep(3)}
            />
          </View>
        </ScrollView>

        {showOnboardingGuideOutside ? (
          <Animated.View
            entering={FadeInDown.duration(350)}
            style={[
              styles.floatingGuideCard,
              onboardingStep === 0
                ? { top: insets.top + 10 }
                : { bottom: insets.bottom + 72 },
            ]}
          >
            <GuideOnboardingCard
              stepIndex={onboardingStep}
              totalSteps={INTERESTS_SETUP_STEPS.length}
              title={currentSetupStep.title}
              description={currentSetupStep.description}
              showBack={false}
              showNext={false}
              onSkip={completeOnboarding}
            />
          </Animated.View>
        ) : null}

        <View
          style={[
            styles.bottomBar,
            onboardingActive &&
              onboardingStep === 3 &&
              styles.setupGuideHighlight,
          ]}
        >
          <TouchableOpacity
            style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving || (onboardingActive && onboardingStep !== 3)}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.bottomSaveText}>Save interests</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingGuideCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  modalGuideCard: {
    marginBottom: 12,
  },
  setupGuideHighlight: {
    borderWidth: 2,
    borderColor: '#3B5A85',
    borderRadius: 14,
  },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loaderText: { color: '#374151' },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 12,
    color: '#111827',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  bottomSaveBtn: {
    height: 50,
    borderRadius: 999,
    backgroundColor: '#3B5A85',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
