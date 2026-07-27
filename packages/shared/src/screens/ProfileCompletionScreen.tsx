/**
 * Profile Completion wizard — CRJ steps after Authentication (6–10 + Success).
 *
 * Flow: Profile Type → Profile Information/Photo → Interests → Location →
 * Notifications → Registration Success → MainTabs.
 *
 * TEMPORARY: Phone OTP remains out of scope (handled earlier in Register).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { RegistrationLayout } from '../components/registration/RegistrationLayout';
import { RegistrationProgress } from '../components/registration/RegistrationProgress';
import { RegistrationFadeSlideIn } from '../components/registration/RegistrationFadeSlideIn';
import { InterestChip } from '../components/InterestChip';
import { PrimaryButton, SecondaryButton } from '../components/PrimaryButton';
import AnimatedNearsyLogo from '../components/auth/AnimatedNearsyLogo';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';
import { firebaseAuth } from '../config/firebaseConfig';
import {
  getUserProfile,
  updateUserProfilePartial,
  updateUserMode,
} from '../services/firestoreService';
import { uploadProfileImage } from '../services/storageService';
import {
  consumePendingSocialProfilePrefill,
  mergeCompleteProfilePrefill,
  peekPendingSocialProfilePrefill,
  sanitizeSocialPhotoUrl,
} from '../authentication/social';
import {
  buildActiveProfileSavePatch,
  resolveModePresentation,
  type ProfileMode,
} from '../profile/profileModeFields';
import {
  affiliationsFromSelectedItems,
  buildOnboardingInterestSample,
  labelsFromAffiliations,
  type OnboardingInterestItem,
} from '../interests/onboardingInterestSample';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileCompletion'>;

const STEPS = [
  'type',
  'info',
  'interests',
  'location',
  'notifications',
  'success',
] as const;
type Step = (typeof STEPS)[number];

const STEP_NUMBER: Partial<Record<Step, number>> = {
  type: 6,
  info: 7,
  interests: 8,
  location: 9,
  notifications: 10,
};
const TOTAL_STEPS = 10;

function isLocalUri(value?: string | null) {
  return !!value && /^(file|content|ph|assets-library):/i.test(value);
}

/** Fallback photo from Firebase Auth / Google providerData (HTTPS only). */
function resolveAuthProviderPhotoUrl(): string | null {
  const user = firebaseAuth.currentUser;
  if (!user) return null;

  const fromUser = sanitizeSocialPhotoUrl(user.photoURL);
  if (fromUser) return fromUser;

  for (const provider of user.providerData ?? []) {
    if (provider.providerId === 'google.com') {
      const fromProvider = sanitizeSocialPhotoUrl(provider.photoURL);
      if (fromProvider) return fromProvider;
    }
  }
  return null;
}

export default function ProfileCompletionScreen({ navigation, route }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const uid =
    route.params?.uid ||
    firebaseAuth.currentUser?.uid ||
    '';

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [mode, setMode] = useState<ProfileMode | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedInterestIds, setSelectedInterestIds] = useState<string[]>([]);
  const [realName, setRealName] = useState('');
  const [shellData, setShellData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [interestSample, setInterestSample] = useState<
    OnboardingInterestItem[]
  >([]);
  const [interestsCatalogError, setInterestsCatalogError] = useState(false);

  /**
   * Wizard-held photo (Google prefill or user Take/Upload). Survives mode
   * switches when the selected mode has no persisted image yet.
   */
  const wizardPhotoRef = useRef<string | null>(null);
  const prefillConsumedRef = useRef(false);

  const step: Step = STEPS[stepIndex];
  const stepNumber = STEP_NUMBER[step];

  function loadInterestSample() {
    try {
      const sample = buildOnboardingInterestSample(4);
      setInterestSample(sample);
      setInterestsCatalogError(sample.length === 0);
    } catch {
      setInterestSample([]);
      setInterestsCatalogError(true);
    }
  }

  function setWizardPhoto(uri: string | null) {
    wizardPhotoRef.current = uri;
    setPhotoUri(uri);
  }

  function applyModePresentation(
    data: Record<string, unknown> | null | undefined,
    nextMode: ProfileMode,
  ) {
    const presentation = resolveModePresentation(data, nextMode);
    // Never wipe a Google/user wizard photo with an empty mode shell.
    if (presentation.profileImage) {
      setPhotoUri(presentation.profileImage);
    } else if (wizardPhotoRef.current) {
      setPhotoUri(wizardPhotoRef.current);
    }

    const aff =
      nextMode === 'professional'
        ? (data?.professionalInterestAffiliations as
            | Record<string, { id: string }[] | undefined>
            | undefined)
        : (data?.personalInterestAffiliations as
            | Record<string, { id: string }[] | undefined>
            | undefined);
    if (aff) {
      const ids: string[] = [];
      for (const list of Object.values(aff)) {
        for (const item of list ?? []) {
          if (item?.id) ids.push(item.id);
        }
      }
      setSelectedInterestIds(ids);
    } else {
      setSelectedInterestIds([]);
    }
  }

  const loadShell = useCallback(async () => {
    if (!uid) return;
    try {
      let existing = await getUserProfile(uid);
      if (!existing) {
        const email =
          route.params?.email ??
          firebaseAuth.currentUser?.email ??
          '';
        await updateUserProfilePartial(uid, {
          email,
          realName: '',
          visibility: false,
          profileImage: null,
          profileSetupCompleted: false,
          profiles: {
            personal: {
              profileImage: null,
              occupation: '',
              status: '',
              bio: '',
            },
            professional: {
              profileImage: null,
              occupation: '',
              status: '',
              bio: '',
              company: '',
            },
          },
        });
        existing = await getUserProfile(uid);
      }

      setShellData((existing as any) ?? null);

      let nextName = String(existing?.realName ?? '').trim();
      let nextPhoto: string | null = null;
      const existingMode =
        existing?.mode === 'personal' || existing?.mode === 'professional'
          ? existing.mode
          : null;

      if (existingMode) {
        setMode(existingMode);
        nextPhoto =
          resolveModePresentation(existing as any, existingMode).profileImage;
      }

      // Precedence for initial photo (new Google user):
      // 1) profiles[mode].profileImage (above)
      // 2) wizardPhotoRef (already chosen this session)
      // 3) pending Google store (one-shot)
      // 4) Firebase Auth / Google providerData
      if (!nextPhoto && wizardPhotoRef.current) {
        nextPhoto = wizardPhotoRef.current;
      }

      let socialPrefill = null;
      try {
        const pending = peekPendingSocialProfilePrefill();
        if (pending?.uid === uid && !prefillConsumedRef.current) {
          socialPrefill = consumePendingSocialProfilePrefill(uid);
          prefillConsumedRef.current = true;
        }
      } catch {
        socialPrefill = null;
      }

      if (socialPrefill) {
        const merged = mergeCompleteProfilePrefill(
          {
            realName: nextName,
            profileImage: nextPhoto,
            email: (existing as any)?.email ?? null,
          },
          socialPrefill,
        );
        if (merged.realName?.trim()) {
          nextName = merged.realName.trim();
        }
        if (merged.profileImage?.trim()) {
          nextPhoto = merged.profileImage.trim();
        }
        // Persist realName early so remounts keep the shared identity.
        if (nextName && !String(existing?.realName ?? '').trim()) {
          try {
            await updateUserProfilePartial(uid, {
              realName: nextName,
              profileSetupCompleted: false,
            });
          } catch {
            // fail-soft
          }
        }
      }

      if (!nextPhoto) {
        nextPhoto = resolveAuthProviderPhotoUrl();
      }

      if (existingMode) {
        applyModePresentation(
          {
            ...(existing as any),
            ...(nextPhoto
              ? {
                  profiles: {
                    ...((existing as any)?.profiles ?? {}),
                    [existingMode]: {
                      ...((existing as any)?.profiles?.[existingMode] ?? {}),
                      profileImage: nextPhoto,
                    },
                  },
                }
              : {}),
          },
          existingMode,
        );
      }

      if (nextName) setRealName(nextName);
      if (nextPhoto) {
        wizardPhotoRef.current = nextPhoto;
        setPhotoUri(nextPhoto);
      }
      loadInterestSample();
    } finally {
      setHydrated(true);
    }
  }, [uid, route.params?.email]);

  useEffect(() => {
    void loadShell();
  }, [loadShell]);

  function toggleInterest(id: string) {
    setSelectedInterestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setWizardPhoto(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setWizardPhoto(result.assets[0].uri);
    }
  }

  function isStepValid(): boolean {
    switch (step) {
      case 'type':
        return mode != null;
      case 'info':
        // Approved prototype (nearsy-rn-v3 README): photo mandatory, no skip.
        return !!photoUri?.trim();
      case 'interests':
        if (interestsCatalogError || interestSample.length === 0) return false;
        return selectedInterestIds.length >= 1;
      case 'location':
      case 'notifications':
      case 'success':
        return true;
    }
  }

  function blockedReason(): string | undefined {
    if (isStepValid()) return undefined;
    switch (step) {
      case 'type':
        return t('onboarding.profileCompletion.type.chooseRequired');
      case 'info':
        return t('onboarding.profileCompletion.info.photoRequired');
      case 'interests':
        return t('onboarding.profileCompletion.interests.pickRequired');
      default:
        return undefined;
    }
  }

  async function persistType() {
    if (!uid || !mode) return;
    await updateUserMode(uid, mode);
  }

  async function persistInfo() {
    if (!uid || !mode || !photoUri) return;

    let imageUrl = photoUri;
    if (isLocalUri(photoUri)) {
      imageUrl = await uploadProfileImage(uid, photoUri);
    }

    // Photo for active mode only. Never sets profileSetupCompleted true.
    const patch = buildActiveProfileSavePatch({
      mode,
      realName: realName.trim() || undefined,
      presentation: {
        profileImage: imageUrl,
      },
      projectActiveToTopLevel: true,
    });

    await updateUserProfilePartial(uid, {
      ...patch,
      profileSetupCompleted: false,
    });
    setWizardPhoto(imageUrl);
    setShellData((prev) => ({
      ...(prev ?? {}),
      ...patch,
      mode,
      profileSetupCompleted: false,
      profiles: {
        ...((prev?.profiles as any) ?? {}),
        [mode]: {
          ...(((prev?.profiles as any)?.[mode] as object) ?? {}),
          profileImage: imageUrl,
        },
      },
    }));
  }

  async function persistInterests() {
    if (!uid || !mode) return;
    const selected = new Set(selectedInterestIds);
    const aff = affiliationsFromSelectedItems(interestSample, selected);
    const labels = labelsFromAffiliations(aff);

    if (mode === 'personal') {
      await updateUserProfilePartial(uid, {
        personalInterests: labels,
        personalInterestAffiliations: aff,
        profileSetupCompleted: false,
      });
    } else {
      await updateUserProfilePartial(uid, {
        professionalInterests: labels,
        professionalInterestAffiliations: aff,
        profileSetupCompleted: false,
      });
    }
  }

  async function requestLocation() {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) {
      setStepIndex((i) => i + 1);
      return;
    }
    const req = await Location.requestForegroundPermissionsAsync();
    if (!req.granted) {
      Alert.alert(
        t('onboarding.profileCompletion.location.deniedTitle'),
        t('onboarding.profileCompletion.location.deniedMessage'),
      );
    }
    setStepIndex((i) => i + 1);
  }

  async function requestNotifications() {
    const current = await Notifications.getPermissionsAsync();
    const already =
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (already) {
      setStepIndex((i) => i + 1);
      return;
    }
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    const granted =
      req.granted ||
      req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      Alert.alert(
        t('onboarding.profileCompletion.notifications.deniedTitle'),
        t('onboarding.profileCompletion.notifications.deniedMessage'),
      );
    }
    setStepIndex((i) => i + 1);
  }

  async function finishOnboarding() {
    if (!uid || !mode || submitting) return;
    try {
      setSubmitting(true);
      // visibility stays false until the user enables Active on Home.
      // profileSetupCompleted is the only completion flag for this gate.
      await updateUserProfilePartial(uid, {
        profileSetupCompleted: true,
        mode,
        ...(realName.trim() ? { realName: realName.trim() } : {}),
      });
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (e: any) {
      Alert.alert(
        t('onboarding.profileCompletion.saveErrorTitle'),
        e?.message || t('onboarding.profileCompletion.saveErrorMessage'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function goNext() {
    if (!isStepValid() || submitting) return;
    try {
      setSubmitting(true);
      if (step === 'type') {
        await persistType();
        setStepIndex((i) => i + 1);
      } else if (step === 'info') {
        await persistInfo();
        setStepIndex((i) => i + 1);
      } else if (step === 'interests') {
        await persistInterests();
        setStepIndex((i) => i + 1);
      } else if (step === 'location') {
        // handled by dedicated buttons
      } else if (step === 'notifications') {
        // handled by dedicated buttons
      } else if (step === 'success') {
        await finishOnboarding();
      }
    } catch (e: any) {
      Alert.alert(
        t('onboarding.profileCompletion.saveErrorTitle'),
        e?.message || t('onboarding.profileCompletion.saveErrorMessage'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (step === 'success' || stepIndex <= 0) return;
    setStepIndex((i) => i - 1);
  }

  if (!hydrated) {
    return (
      <RegistrationLayout>
        <View style={styles.loadingWrap}>
          <Text style={{ color: palette.textSecondary }}>
            {t('common.loading')}
          </Text>
        </View>
      </RegistrationLayout>
    );
  }

  const showFooterContinue =
    step === 'type' || step === 'info' || step === 'interests';

  return (
    <RegistrationLayout
      footer={
        showFooterContinue ? (
          <PrimaryButton
            label={t('onboarding.profileCompletion.continue')}
            onPress={() => {
              void goNext();
            }}
            disabled={!isStepValid() || submitting}
            loading={submitting}
            disabledReason={blockedReason()}
          />
        ) : step === 'location' ? (
          <View style={styles.actionStack}>
            <PrimaryButton
              label={t('onboarding.profileCompletion.location.enable')}
              onPress={() => {
                void requestLocation();
              }}
              loading={submitting}
            />
            <SecondaryButton
              label={t('onboarding.profileCompletion.location.skip')}
              onPress={() => setStepIndex((i) => i + 1)}
            />
          </View>
        ) : step === 'notifications' ? (
          <View style={styles.actionStack}>
            <PrimaryButton
              label={t('onboarding.profileCompletion.notifications.enable')}
              onPress={() => {
                void requestNotifications();
              }}
              loading={submitting}
            />
            <SecondaryButton
              label={t('onboarding.profileCompletion.notifications.skip')}
              onPress={() => setStepIndex((i) => i + 1)}
            />
          </View>
        ) : step === 'success' ? (
          <PrimaryButton
            label={t('onboarding.profileCompletion.success.startExploring')}
            onPress={() => {
              void finishOnboarding();
            }}
            loading={submitting}
          />
        ) : null
      }
    >
      {step !== 'success' && stepNumber != null ? (
        <View style={styles.header}>
          {stepIndex > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.profileCompletion.backA11y')}
              onPress={goBack}
              style={[
                styles.backBtn,
                { backgroundColor: palette.panel, borderColor: palette.border },
              ]}
            >
              <Text
                style={{
                  color: palette.textPrimary,
                  fontSize: 22,
                  lineHeight: 24,
                }}
              >
                {'\u2039'}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 34 }} />
          )}
          <RegistrationProgress
            progress={stepNumber / TOTAL_STEPS}
            stepLabel={`${stepNumber}/${TOTAL_STEPS}`}
          />
        </View>
      ) : null}

      <ScrollView
        style={styles.stepScroll}
        contentContainerStyle={styles.stepBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RegistrationFadeSlideIn animKey={step}>
          {step === 'type' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('onboarding.profileCompletion.type.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('onboarding.profileCompletion.type.subtitle')}
              </Text>
              <View style={styles.options}>
                {(
                  [
                    {
                      id: 'personal' as const,
                      title: t(
                        'onboarding.profileCompletion.type.personalTitle',
                      ),
                      body: t('onboarding.profileCompletion.type.personalBody'),
                      icon: 'person-outline' as const,
                    },
                    {
                      id: 'professional' as const,
                      title: t(
                        'onboarding.profileCompletion.type.professionalTitle',
                      ),
                      body: t(
                        'onboarding.profileCompletion.type.professionalBody',
                      ),
                      icon: 'briefcase-outline' as const,
                    },
                  ] as const
                ).map((o) => {
                  const active = mode === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={o.title}
                      onPress={() => {
                        setMode(o.id);
                        applyModePresentation(shellData, o.id);
                      }}
                      style={[
                        styles.option,
                        {
                          borderColor: active
                            ? palette.primary
                            : palette.border,
                          borderWidth: active ? 1.5 : 1,
                          backgroundColor: active
                            ? palette.chipBg
                            : palette.panel,
                        },
                      ]}
                    >
                      <View style={styles.optionRow}>
                        <Ionicons
                          name={o.icon}
                          size={26}
                          color={
                            active ? palette.primary : palette.textSecondary
                          }
                        />
                        <View style={styles.optionTextCol}>
                          <Text
                            style={[
                              styles.optionTitle,
                              { color: palette.textPrimary },
                            ]}
                          >
                            {o.title}
                          </Text>
                          <Text
                            style={[
                              styles.optionBody,
                              { color: palette.textSecondary },
                            ]}
                          >
                            {o.body}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.radioOuter,
                            {
                              borderColor: active
                                ? palette.primary
                                : palette.borderStrong,
                            },
                          ]}
                        >
                          {active ? (
                            <View
                              style={[
                                styles.radioInner,
                                { backgroundColor: palette.primary },
                              ]}
                            />
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {step === 'info' && (
            <>
              <Text
                style={[
                  styles.title,
                  { color: palette.textPrimary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.info.title')}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: palette.textSecondary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.info.subtitle')}
              </Text>

              <View style={styles.avatarWrap}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarPlaceholder,
                      { backgroundColor: palette.chipBg },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={48}
                      color={palette.textMuted}
                    />
                  </View>
                )}
              </View>

              <View style={styles.photoActions}>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    label={t('onboarding.profileCompletion.info.takePhoto')}
                    onPress={() => {
                      void takePhoto();
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <SecondaryButton
                    label={t('onboarding.profileCompletion.info.uploadPhoto')}
                    onPress={() => {
                      void pickFromLibrary();
                    }}
                  />
                </View>
              </View>
            </>
          )}

          {step === 'interests' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('onboarding.profileCompletion.interests.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('onboarding.profileCompletion.interests.subtitle', {
                  count: selectedInterestIds.length,
                })}
              </Text>
              {interestsCatalogError || interestSample.length === 0 ? (
                <View style={styles.catalogError}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {t(
                      'onboarding.profileCompletion.interests.catalogErrorTitle',
                    )}
                  </Text>
                  <Text
                    style={[
                      styles.optionBody,
                      { color: palette.textSecondary, marginTop: spacing.sm },
                    ]}
                  >
                    {t(
                      'onboarding.profileCompletion.interests.catalogErrorMessage',
                    )}
                  </Text>
                  <View style={{ marginTop: spacing.lg }}>
                    <SecondaryButton
                      label={t(
                        'onboarding.profileCompletion.interests.catalogRetry',
                      )}
                      onPress={loadInterestSample}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.grid}>
                  {interestSample.map((item) => (
                    <InterestChip
                      key={item.id}
                      name={item.name}
                      emoji={item.emoji}
                      selected={selectedInterestIds.includes(item.id)}
                      onPress={() => toggleInterest(item.id)}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          {step === 'location' && (
            <View style={styles.centerBody}>
              <View style={styles.markWrap}>
                <AnimatedNearsyLogo size={54} />
              </View>
              <Text
                style={[
                  styles.title,
                  { color: palette.textPrimary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.location.title')}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: palette.textSecondary,
                    textAlign: 'center',
                    maxWidth: 280,
                  },
                ]}
              >
                {t('onboarding.profileCompletion.location.subtitle')}
              </Text>
            </View>
          )}

          {step === 'notifications' && (
            <View style={styles.centerBody}>
              <View style={styles.markWrap}>
                <AnimatedNearsyLogo size={54} />
              </View>
              <Text
                style={[
                  styles.title,
                  { color: palette.textPrimary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.notifications.title')}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: palette.textSecondary,
                    textAlign: 'center',
                    maxWidth: 280,
                  },
                ]}
              >
                {t('onboarding.profileCompletion.notifications.subtitle')}
              </Text>
            </View>
          )}

          {step === 'success' && (
            <View style={styles.centerBody}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.successAvatar} />
              ) : null}
              <Text
                style={[
                  styles.title,
                  { color: palette.textPrimary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.success.title')}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: palette.textSecondary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.success.subtitle')}
              </Text>
              {realName ? (
                <Text
                  style={[
                    styles.successName,
                    { color: palette.textPrimary },
                  ]}
                >
                  {realName}
                </Text>
              ) : null}
              <Text style={{ color: palette.textMuted, marginTop: spacing.sm }}>
                {t('onboarding.profileCompletion.success.modeLabel', {
                  mode:
                    mode === 'professional'
                      ? t(
                          'onboarding.profileCompletion.success.modeProfessional',
                        )
                      : t('onboarding.profileCompletion.success.modePersonal'),
                })}
              </Text>
              <View style={[styles.grid, { marginTop: spacing.xl }]}>
                {interestSample
                  .filter((i) => selectedInterestIds.includes(i.id))
                  .slice(0, 8)
                  .map((item) => (
                    <InterestChip
                      key={item.id}
                      name={item.name}
                      emoji={item.emoji}
                      selected
                    />
                  ))}
              </View>
            </View>
          )}
        </RegistrationFadeSlideIn>
      </ScrollView>
    </RegistrationLayout>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepScroll: { flex: 1 },
  stepBody: { paddingBottom: spacing.xl, flexGrow: 1 },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    lineHeight: fontSize.xl * 1.2,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    marginTop: spacing.sm,
  },
  options: { gap: spacing.md, marginTop: spacing.xxl },
  option: { borderRadius: radius.xl, padding: spacing.lg },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionTextCol: { flex: 1 },
  optionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.extrabold },
  optionBody: { fontSize: fontSize.sm, lineHeight: 19, marginTop: 4 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  avatarWrap: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.md,
  },
  catalogError: {
    marginTop: spacing.xl,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  markWrap: { marginBottom: spacing.xl },
  actionStack: { gap: spacing.sm },
  successAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: spacing.lg,
  },
  successName: {
    marginTop: spacing.lg,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
