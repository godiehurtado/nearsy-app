// src/screens/InterestsScreen.tsx ✅ RNFirebase-only
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { doc, setDoc } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import TopHeader from '../components/TopHeader';
import InterestsWithLogo from '../components/InterestsWithLogo';
import type { InterestAffiliations, InterestLabel } from '../types/profile';
import { getUserProfile } from '../services/firestoreService';
import { useGuideAudio } from '../hooks/useGuideAudio';

type ProfileMode = 'personal' | 'professional';

type RouteParams = {
  mode?: ProfileMode;
  uid?: string;
  personalAff?: InterestAffiliations;
  professionalAff?: InterestAffiliations;
};

const INTERESTS_ONBOARDING_STEPS = [
  {
    title: 'Choose a category',
    description: 'Select a category to choose your interests.',
  },
  {
    title: 'Pick your interests',
    description: 'Select the interests that represent you.',
  },
  {
    title: 'Finish selecting',
    description: 'Tap Done when you finish selecting your interests.',
  },
  {
    title: 'Save your interests',
    description: 'Tap Save interests to continue.',
  },
];

const INTERESTS_GUIDE_AUDIO: number[] = [
  require('../assets/audio/Interests_SelectYourInterests.mp3'),
  require('../assets/audio/Interests_SelectYourInterests.mp3'),
  require('../assets/audio/Interests_TapDone.mp3'),
  require('../assets/audio/Interests_Save.mp3'),
];

function GuideHighlightSlot({
  highlight,
  dimmed,
  style,
  children,
}: {
  highlight?: boolean;
  dimmed?: boolean;
  style?: object;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.guideSlot, style]}>
      <View style={dimmed ? styles.guideDimmed : undefined}>{children}</View>
      {highlight ? (
        <View style={styles.guideHighlightOverlay} pointerEvents="none" />
      ) : null}
    </View>
  );
}

export default function InterestsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const params = (route.params ?? {}) as RouteParams;
  const mode: ProfileMode =
    params.mode === 'professional' ? 'professional' : 'personal';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);

  const [personalAff, setPersonalAff] = useState<InterestAffiliations>({});
  const [professionalAff, setProfessionalAff] = useState<InterestAffiliations>(
    {},
  );

  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [interestsModalOpen, setInterestsModalOpen] = useState(false);
  const [openedGuideCategory, setOpenedGuideCategory] =
    useState<InterestLabel | null>(null);
  const [modalCloseSignal, setModalCloseSignal] = useState(0);

  const currentAff = mode === 'personal' ? personalAff : professionalAff;
  const setCurrentAff =
    mode === 'personal' ? setPersonalAff : setProfessionalAff;

  const title = useMemo(
    () => `${mode === 'personal' ? 'Personal' : 'Professional'} Interests`,
    [mode],
  );

  const cleanAffiliations = (aff: InterestAffiliations): InterestAffiliations =>
    Object.fromEntries(
      Object.entries(aff ?? {}).filter(
        ([, arr]) => Array.isArray(arr) && arr.length > 0,
      ),
    ) as InterestAffiliations;

  const labelsFromAff = (aff: InterestAffiliations): string[] =>
    Object.keys(aff ?? {});

  const onboardingActive =
    isSetupMode &&
    Platform.OS === 'ios' &&
    !onboardingCompleted &&
    !loading;

  const { unload: unloadOnboardingAudio } = useGuideAudio(
    onboardingActive,
    INTERESTS_GUIDE_AUDIO[onboardingStep],
  );

  const completeOnboarding = useCallback(() => {
    setOnboardingCompleted(true);
    void unloadOnboardingAudio();
  }, [unloadOnboardingAudio]);

  const goNextOnboardingStep = () => {
    if (onboardingStep === 1) {
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
    }
  };

  const goBackOnboardingStep = () => {
    if (onboardingStep === 1) {
      setOnboardingStep(0);
      setOpenedGuideCategory(null);
      setModalCloseSignal((n) => n + 1);
      return;
    }

    if (onboardingStep === 2) {
      setOnboardingStep(1);
    }
  };

  const showOnboardingGuideOutside =
    onboardingActive && (onboardingStep === 0 || onboardingStep === 3);

  const showOnboardingGuideInModal =
    onboardingActive &&
    interestsModalOpen &&
    (onboardingStep === 1 || onboardingStep === 2);

  const onboardingGuideCardBody = (
    <>
      <View style={styles.guideHeader}>
        <View style={styles.guideBadge}>
          <Text style={styles.guideBadgeText}>
            {onboardingStep + 1}/{INTERESTS_ONBOARDING_STEPS.length}
          </Text>
        </View>

        <TouchableOpacity onPress={completeOnboarding}>
          <Text style={styles.guideSkip}>Skip guide</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.guideTitle}>
        {INTERESTS_ONBOARDING_STEPS[onboardingStep].title}
      </Text>

      <Text style={styles.guideDescription}>
        {INTERESTS_ONBOARDING_STEPS[onboardingStep].description}
      </Text>

      {onboardingStep === 1 ? (
        <View style={styles.guideActionsRow}>
          <TouchableOpacity
            style={styles.guideNavButton}
            onPress={goBackOnboardingStep}
            activeOpacity={0.85}
          >
            <Text style={styles.guideNavButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guideNavButtonPrimary}
            onPress={goNextOnboardingStep}
            activeOpacity={0.85}
          >
            <Text style={styles.guideNavButtonPrimaryText}>Next</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {onboardingStep === 2 ? (
        <View style={styles.guideActionsRow}>
          <TouchableOpacity
            style={styles.guideNavButton}
            onPress={goBackOnboardingStep}
            activeOpacity={0.85}
          >
            <Text style={styles.guideNavButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  const modalGuideCard = showOnboardingGuideInModal ? (
    <Animated.View entering={FadeInDown.duration(350)} style={styles.modalGuideCard}>
      {onboardingGuideCardBody}
    </Animated.View>
  ) : null;

  const handleSave = async () => {
    try {
      setSaving(true);

      const uid = params.uid || firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      if (mode === 'personal') {
        const clean = cleanAffiliations(personalAff);
        const labels = labelsFromAff(clean);

        await setDoc(
          doc(firestoreDb, 'users', uid),
          {
            personalInterests: labels,
            personalInterestAffiliations: clean,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      } else {
        const clean = cleanAffiliations(professionalAff);
        const labels = labelsFromAff(clean);

        await setDoc(
          doc(firestoreDb, 'users', uid),
          {
            professionalInterests: labels,
            professionalInterestAffiliations: clean,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      }

      if (onboardingActive) {
        setOnboardingCompleted(true);
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

        setIsSetupMode(existing.profileSetupCompleted !== true);

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
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
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
              guideStep={onboardingActive ? onboardingStep : undefined}
              modalGuideCard={modalGuideCard}
              closeModalSignal={modalCloseSignal}
              onGuideCategoryOpened={(interest) => {
                setOpenedGuideCategory(interest);
                setOnboardingStep(1);
              }}
              onGuideModalDone={() => setOnboardingStep(3)}
              onGuideModalOpenChange={setInterestsModalOpen}
              guideAllowInterestToggle={
                !onboardingActive || onboardingStep === 1
              }
              guideAllowDone={!onboardingActive || onboardingStep === 2}
            />
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <GuideHighlightSlot
            highlight={onboardingActive && onboardingStep === 3}
            dimmed={onboardingActive && onboardingStep !== 3}
          >
            <TouchableOpacity
              style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={
                saving || (onboardingActive && onboardingStep !== 3)
              }
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
          </GuideHighlightSlot>
        </View>
      </KeyboardAvoidingView>

      {showOnboardingGuideOutside ? (
        <Animated.View
          entering={FadeInDown.duration(350)}
          style={[styles.floatingGuideCard, { top: insets.top + 10 }]}
          pointerEvents="box-none"
        >
          {onboardingGuideCardBody}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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

  guideSlot: {
    position: 'relative',
  },
  guideDimmed: {
    opacity: 0.45,
  },
  guideHighlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#3B5A85',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  floatingGuideCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 10,
  },
  modalGuideCard: {
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  guideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  guideBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  guideBadgeText: {
    color: '#3B5A85',
    fontSize: 12,
    fontWeight: '800',
  },
  guideSkip: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  guideDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  guideActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  guideNavButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
  },
  guideNavButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
  },
  guideNavButtonPrimary: {
    flex: 1,
    backgroundColor: '#3B5A85',
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
  },
  guideNavButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
