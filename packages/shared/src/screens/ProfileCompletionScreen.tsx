/**
 * Profile Completion wizard — CRJ profile-creation phase after Authentication.
 *
 * Flow: Profile Type → Name → Last Name → Photo → Profile Details →
 * Interests (11 category screens) → Interests Celebration / Affiliations
 * Transition → Affiliations (7 category screens) → Social Media →
 * Location → Notifications → Registration Success → MainTabs.
 *
 * TEMPORARY: Phone OTP remains out of scope (handled earlier in Register).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FormInput } from '../components/registration/FormInput';
import { OnboardingInterestCategoryPanel } from '../components/registration/OnboardingInterestCategoryPanel';
import { OnboardingAffiliationCategoryPanel } from '../components/registration/OnboardingAffiliationCategoryPanel';
import { OnboardingSocialMediaStep } from '../components/registration/OnboardingSocialMediaStep';
import { InterestsCelebrationStep } from '../components/registration/InterestsCelebrationStep';
import { InterestsIntroVisual } from '../components/registration/InterestsIntroVisual';
import {
  crjPhaseProgress,
  type CrjProgressPhase,
} from '../components/registration/crjProgress';
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
import { uploadProfileImage, uploadAffiliationImage } from '../services/storageService';
import {
  commitPendingSocialNamePrefill,
  clearPendingSocialProfilePrefill,
  peekAppliedSocialNamePrefill,
  peekPendingSocialProfilePrefill,
  resolveCrjNamePrefill,
  sanitizeSocialPhotoUrl,
} from '../authentication/social';
import {
  buildActiveProfileSavePatch,
  resolveModePresentation,
  type ProfileMode,
} from '../profile/profileModeFields';
import {
  buildCrjDetailsPresentation,
  isCrjProfileDetailsValid,
} from '../profile/crjProfileDetails';
import {
  buildCrjInterestPersistencePatch,
  countFinalOnboardingInterests,
  getOnboardingCategory,
  interestsRemainingToMinimum,
  listOnboardingCategoryIds,
  meetsMinimumOnboardingInterests,
  type OnboardingInterestCategoryId,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  isHierarchicalInterestCategory,
  resolveActiveGroupId,
} from '../interests/interestHierarchy';
import {
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from '../affiliations/onboardingAffiliationCatalog';
import { buildCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import {
  emptyCrjSocialDraftValues,
  type CrjSocialDraftValues,
} from '../social/onboardingSocialCatalog';
import {
  POST_SOCIAL_MEDIA_CRJ_STEP,
  buildCrjSocialLinksPersistencePatch,
  readCrjSocialDraft,
  readExistingSocialLinks,
} from '../social/onboardingSocialPersistence';
import {
  collectSocialFieldErrors,
  type CrjSocialFieldErrors,
} from '../social/socialLinkNormalize';
import type { SocialCustomLink } from '../types/profile';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileCompletion'>;

const PRE_INTEREST_STEPS = [
  'type',
  'identity',
  'photo',
  'details',
  'interestsIntro',
] as const;
const AFFILIATION_CATEGORY_IDS = listOnboardingAffiliationCategoryIds();
const POST_AFFILIATION_STEPS = [
  POST_SOCIAL_MEDIA_CRJ_STEP,
  'notifications',
  'success',
] as const;
const INTEREST_CATEGORY_IDS = listOnboardingCategoryIds();

type FixedPreStep = (typeof PRE_INTEREST_STEPS)[number];
type PostAffiliationStep = (typeof POST_AFFILIATION_STEPS)[number];

type ResolvedStep =
  | { kind: FixedPreStep }
  | {
      kind: 'interest';
      interestCategoryIndex: number;
      categoryId: OnboardingInterestCategoryId;
    }
  | { kind: 'interestsCelebration' }
  | {
      kind: 'affiliation';
      affiliationCategoryIndex: number;
      categoryId: OnboardingAffiliationCategoryId;
    }
  | { kind: 'socialMedia' }
  | { kind: PostAffiliationStep };

function resolveStep(stepIndex: number): ResolvedStep {
  if (stepIndex < PRE_INTEREST_STEPS.length) {
    return { kind: PRE_INTEREST_STEPS[stepIndex]! };
  }
  let offset = stepIndex - PRE_INTEREST_STEPS.length;
  if (offset < INTEREST_CATEGORY_IDS.length) {
    const categoryId = INTEREST_CATEGORY_IDS[offset]!;
    return {
      kind: 'interest',
      interestCategoryIndex: offset,
      categoryId,
    };
  }
  offset -= INTEREST_CATEGORY_IDS.length;
  if (offset === 0) return { kind: 'interestsCelebration' };
  offset -= 1;
  if (offset < AFFILIATION_CATEGORY_IDS.length) {
    const categoryId = AFFILIATION_CATEGORY_IDS[offset]!;
    return {
      kind: 'affiliation',
      affiliationCategoryIndex: offset,
      categoryId,
    };
  }
  offset -= AFFILIATION_CATEGORY_IDS.length;
  if (offset === 0) return { kind: 'socialMedia' };
  offset -= 1;
  return { kind: POST_AFFILIATION_STEPS[offset]! };
}

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

function readOnboardingInterests(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): OnboardingSelectedInterest[] {
  const key =
    mode === 'professional'
      ? 'professionalOnboardingInterests'
      : 'personalOnboardingInterests';
  const raw = data?.[key];
  if (!Array.isArray(raw)) return [];
  const out: OnboardingSelectedInterest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.categoryId !== 'string'
    ) {
      continue;
    }
    out.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId as OnboardingInterestCategoryId,
      icon: typeof row.icon === 'string' ? row.icon : 'star-outline',
      iconColor:
        typeof row.iconColor === 'string' ? row.iconColor : '#64748B',
      ...(row.isCustom === true ? { isCustom: true } : {}),
      ...(typeof row.groupId === 'string' && row.groupId
        ? { groupId: row.groupId }
        : {}),
    });
  }
  return out;
}

function readOnboardingAffiliations(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): OnboardingSelectedAffiliation[] {
  const key =
    mode === 'professional'
      ? 'professionalOnboardingAffiliations'
      : 'personalOnboardingAffiliations';
  const raw = data?.[key];
  if (!Array.isArray(raw)) return [];
  const out: OnboardingSelectedAffiliation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.categoryId !== 'string' ||
      (row.source !== 'provider' && row.source !== 'custom')
    ) {
      continue;
    }
    out.push({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId as OnboardingAffiliationCategoryId,
      source: row.source,
      ...(typeof row.providerId === 'string' && row.providerId
        ? { providerId: row.providerId }
        : {}),
      ...(typeof row.logoUrl === 'string' && row.logoUrl
        ? { logoUrl: row.logoUrl }
        : {}),
      ...(typeof row.website === 'string' && row.website
        ? { website: row.website }
        : {}),
      ...(typeof row.topic === 'string' && row.topic
        ? { topic: row.topic }
        : {}),
    });
  }
  return out;
}

function progressPhaseForStep(step: ResolvedStep): CrjProgressPhase | null {
  switch (step.kind) {
    case 'type':
      return 'type';
    case 'identity':
      return 'identity';
    case 'photo':
      return 'photo';
    case 'details':
      return 'details';
    case 'interestsIntro':
    case 'interest':
    case 'interestsCelebration':
      return 'interests';
    case 'affiliation':
      return 'affiliations';
    case 'socialMedia':
      return 'social';
    case 'location':
      return 'location';
    case 'notifications':
      return 'notifications';
    case 'success':
      return null;
  }
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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [occupation, setOccupation] = useState('');
  const [company, setCompany] = useState('');
  const [bio, setBio] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<
    OnboardingSelectedInterest[]
  >([]);
  const [selectedAffiliations, setSelectedAffiliations] = useState<
    OnboardingSelectedAffiliation[]
  >([]);
  const [socialDraft, setSocialDraft] = useState<CrjSocialDraftValues>(
    emptyCrjSocialDraftValues,
  );
  const [socialCustom, setSocialCustom] = useState<SocialCustomLink[]>([]);
  const [socialFieldErrors, setSocialFieldErrors] =
    useState<CrjSocialFieldErrors>({});
  const [activeInterestGroupByCategory, setActiveInterestGroupByCategory] =
    useState<Partial<Record<OnboardingInterestCategoryId, string>>>({});
  const [shellData, setShellData] = useState<Record<string, unknown> | null>(
    null,
  );

  /** Success display name — mirrors firstName. */
  const realName = firstName;

  /**
   * Wizard-held photo (Google prefill or user Take/Upload). Survives mode
   * switches when the selected mode has no persisted image yet.
   */
  const wizardPhotoRef = useRef<string | null>(null);
  const firstNameEditedRef = useRef(false);
  const lastNameEditedRef = useRef(false);
  /** True after pending was committed for this wizard instance. */
  const namePrefillCommittedRef = useRef(false);
  const firstNameRef = useRef(firstName);
  const lastNameRef = useRef(lastName);
  firstNameRef.current = firstName;
  lastNameRef.current = lastName;

  const step = useMemo(() => resolveStep(stepIndex), [stepIndex]);
  const interestCategoryIndex =
    step.kind === 'interest' ? step.interestCategoryIndex : 0;
  const affiliationCategoryIndex =
    step.kind === 'affiliation' ? step.affiliationCategoryIndex : 0;

  const progressPhase = progressPhaseForStep(step);
  const progressValue =
    progressPhase != null ? crjPhaseProgress(progressPhase) : 0;

  function setWizardPhoto(uri: string | null) {
    wizardPhotoRef.current = uri;
    setPhotoUri(uri);
  }

  function onFirstNameChange(value: string) {
    firstNameEditedRef.current = true;
    setFirstName(value);
  }

  function onLastNameChange(value: string) {
    lastNameEditedRef.current = true;
    setLastName(value);
  }

  function applyModePresentation(
    data: Record<string, unknown> | null | undefined,
    nextMode: ProfileMode,
  ) {
    const presentation = resolveModePresentation(data, nextMode);

    setFirstName((prev) => presentation.realName || prev);
    setLastName((prev) => presentation.lastName || prev);
    setOccupation(presentation.occupation ?? '');
    setCompany(presentation.company ?? '');
    setBio(presentation.bio ?? '');

    // Never wipe a Google/user wizard photo with an empty mode shell.
    if (presentation.profileImage) {
      setPhotoUri(presentation.profileImage);
    } else if (wizardPhotoRef.current) {
      setPhotoUri(wizardPhotoRef.current);
    } else {
      setPhotoUri(null);
    }

    setSelectedInterests(readOnboardingInterests(data, nextMode));
    setSelectedAffiliations(readOnboardingAffiliations(data, nextMode));
    const social = readCrjSocialDraft(data, nextMode);
    setSocialDraft(social.values);
    setSocialCustom(social.custom);
    setSocialFieldErrors({});
  }

  /**
   * Apply pending social name prefill when entering the Name step.
   * Handles pending written after ProfileCompletion mount (Auth race).
   */
  const applyNamePrefillFromPending = useCallback(() => {
    if (!uid || namePrefillCommittedRef.current) return;

    const pending = peekPendingSocialProfilePrefill();
    const retained = peekAppliedSocialNamePrefill();
    const result = resolveCrjNamePrefill({
      uid,
      firstName: firstNameRef.current,
      lastName: lastNameRef.current,
      firstNameEdited: firstNameEditedRef.current,
      lastNameEdited: lastNameEditedRef.current,
      pending,
      retainedApplied: retained,
    });

    if (result.prefillAppliedToFirstName) {
      setFirstName(result.nextFirstName);
      firstNameRef.current = result.nextFirstName;
    }
    if (result.prefillAppliedToLastName) {
      setLastName(result.nextLastName);
      lastNameRef.current = result.nextLastName;
    }

    if (result.shouldConsumePending && result.retainedApplied) {
      commitPendingSocialNamePrefill(result.retainedApplied);
      namePrefillCommittedRef.current = true;
    } else if (
      !result.diag.pendingPresentAtNameStep &&
      result.retainedApplied &&
      (result.prefillAppliedToFirstName || result.prefillAppliedToLastName)
    ) {
      // Remount path: re-applied from retained snapshot; mark settled.
      namePrefillCommittedRef.current = true;
    }
  }, [uid]);

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
              bio: '',
            },
            professional: {
              profileImage: null,
              occupation: '',
              bio: '',
              company: '',
            },
          },
        });
        existing = await getUserProfile(uid);
      }

      setShellData((existing as Record<string, unknown>) ?? null);

      let nextPhoto: string | null = null;
      const existingMode =
        existing?.mode === 'personal' || existing?.mode === 'professional'
          ? existing.mode
          : null;

      if (existingMode) {
        setMode(existingMode);
        nextPhoto = resolveModePresentation(
          existing as Record<string, unknown>,
          existingMode,
        ).profileImage;
        applyModePresentation(
          existing as Record<string, unknown>,
          existingMode,
        );
      }

      // Precedence for initial photo (new Google user):
      // 1) profiles[mode].profileImage (above)
      // 2) wizardPhotoRef (already chosen this session)
      // 3) pending Google store (peek only — names apply on Name step)
      // 4) Firebase Auth / Google providerData
      if (!nextPhoto && wizardPhotoRef.current) {
        nextPhoto = wizardPhotoRef.current;
      }

      try {
        const pending = peekPendingSocialProfilePrefill();
        if (pending?.uid === uid) {
          const socialPhoto = sanitizeSocialPhotoUrl(
            pending.socialProfile.photoUrl,
          );
          if (socialPhoto?.trim()) {
            nextPhoto = nextPhoto || socialPhoto.trim();
          }
        }
      } catch {
        // Prefill photo is fail-soft.
      }

      if (!nextPhoto) {
        nextPhoto = resolveAuthProviderPhotoUrl();
      }

      if (nextPhoto) {
        wizardPhotoRef.current = nextPhoto;
        setPhotoUri(nextPhoto);
      }
    } finally {
      setHydrated(true);
    }
  }, [uid, route.params?.email]);

  useEffect(() => {
    void loadShell();
  }, [loadShell]);

  useEffect(() => {
    if (!hydrated || step.kind !== 'identity') return;
    applyNamePrefillFromPending();
  }, [hydrated, step.kind, applyNamePrefillFromPending]);

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

  function selectionsInCurrentCategory(): number {
    if (step.kind !== 'interest') return 0;
    return selectedInterests.filter((s) => s.categoryId === step.categoryId)
      .length;
  }

  function isStepValid(): boolean {
    switch (step.kind) {
      case 'type':
        return mode != null;
      case 'identity':
        return firstName.trim().length > 0 && lastName.trim().length > 0;
      case 'photo':
        return !!photoUri?.trim();
      case 'details':
        return isCrjProfileDetailsValid({
          mode,
          occupation,
          bio,
          company,
        });
      case 'interestsIntro':
      case 'interest':
      case 'interestsCelebration':
      case 'affiliation':
      case 'socialMedia':
        return true;
      case 'location':
      case 'notifications':
      case 'success':
        return true;
    }
  }

  function blockedReason(): string | undefined {
    if (isStepValid()) return undefined;
    switch (step.kind) {
      case 'type':
        return t('onboarding.profileCompletion.type.chooseRequired');
      case 'identity':
        if (!firstName.trim()) {
          return t('onboarding.profileCompletion.identity.nameRequired');
        }
        if (!lastName.trim()) {
          return t('onboarding.profileCompletion.identity.lastNameRequired');
        }
        return t('onboarding.profileCompletion.identity.required');
      case 'photo':
        return t('onboarding.profileCompletion.info.photoRequired');
      case 'details':
        return t('onboarding.profileCompletion.details.required' as any);
      default:
        return undefined;
    }
  }

  async function persistType() {
    if (!uid || !mode) return;
    await updateUserMode(uid, mode);
  }

  async function persistName() {
    if (!uid || !mode) return;
    const patch = buildActiveProfileSavePatch({
      mode,
      presentation: {
        realName: firstName.trim(),
        lastName: lastName.trim(),
      },
      projectActiveToTopLevel: true,
    });
    await updateUserProfilePartial(uid, {
      ...patch,
      profileSetupCompleted: false,
    });
    setShellData((prev) => ({
      ...(prev ?? {}),
      ...patch,
      mode,
      profileSetupCompleted: false,
    }));
  }

  async function persistPhoto() {
    if (!uid || !mode || !photoUri) return;

    let imageUrl = photoUri;
    if (isLocalUri(photoUri)) {
      imageUrl = await uploadProfileImage(uid, photoUri);
    }

    const patch = buildActiveProfileSavePatch({
      mode,
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
        ...((prev?.profiles as object) ?? {}),
        [mode]: {
          ...(((prev?.profiles as Record<string, object> | undefined)?.[
            mode
          ] as object) ?? {}),
          profileImage: imageUrl,
        },
      },
    }));
  }

  async function persistDetails() {
    if (!uid || !mode) return;
    const patch = buildActiveProfileSavePatch({
      mode,
      presentation: buildCrjDetailsPresentation({
        mode,
        occupation,
        bio,
        company,
      }),
      projectActiveToTopLevel: true,
    });
    await updateUserProfilePartial(uid, {
      ...patch,
      profileSetupCompleted: false,
    });
    setShellData((prev) => ({
      ...(prev ?? {}),
      ...patch,
      mode,
      profileSetupCompleted: false,
    }));
  }

  async function persistInterests() {
    if (!uid || !mode) return;
    const patch = buildCrjInterestPersistencePatch(mode, selectedInterests);
    await updateUserProfilePartial(uid, patch);
    setShellData((prev) => ({
      ...(prev ?? {}),
      mode,
      ...patch,
    }));
  }

  async function persistAffiliations() {
    if (!uid || !mode) return;
    const resolved = await Promise.all(
      selectedAffiliations.map(async (item) => {
        if (item.logoUrl && isLocalUri(item.logoUrl)) {
          const logoUrl = await uploadAffiliationImage(
            uid,
            item.logoUrl,
            item.categoryId,
          );
          return { ...item, logoUrl };
        }
        return item;
      }),
    );
    setSelectedAffiliations(resolved);
    const patch = buildCrjAffiliationPersistencePatch(mode, resolved);
    await updateUserProfilePartial(uid, patch);
    setShellData((prev) => ({
      ...(prev ?? {}),
      mode,
      ...patch,
    }));
  }

  async function persistSocialMedia() {
    if (!uid || !mode) return;
    const existing = readExistingSocialLinks(shellData, mode);
    const patch = buildCrjSocialLinksPersistencePatch(
      mode,
      socialDraft,
      socialCustom,
      existing,
    );
    await updateUserProfilePartial(uid, patch);
    setShellData((prev) => ({
      ...(prev ?? {}),
      mode,
      ...patch,
    }));
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
        ...(firstName.trim() ? { realName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      });
      clearPendingSocialProfilePrefill();
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

  async function leaveLastInterestCategory() {
    const total = countFinalOnboardingInterests(selectedInterests);
    if (!meetsMinimumOnboardingInterests(selectedInterests)) {
      Alert.alert(
        t('onboarding.profileCompletion.interests.minRequiredTitle' as any),
        t('onboarding.profileCompletion.interests.minRequired' as any, {
          count: total,
          remaining: interestsRemainingToMinimum(selectedInterests),
        }),
      );
      return;
    }
    await persistInterests();
    setStepIndex((i) => i + 1);
  }

  async function leaveLastAffiliationCategory() {
    await persistAffiliations();
    setStepIndex((i) => i + 1);
  }

  async function advanceAffiliation() {
    if (step.kind !== 'affiliation' || submitting) return;

    const isLast =
      affiliationCategoryIndex >= AFFILIATION_CATEGORY_IDS.length - 1;

    try {
      setSubmitting(true);
      if (isLast) {
        await leaveLastAffiliationCategory();
      } else {
        setStepIndex((i) => i + 1);
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

  async function advanceSocialMedia(options: { requireValidFields: boolean }) {
    if (step.kind !== 'socialMedia' || submitting) return;

    const errors = collectSocialFieldErrors(
      socialDraft,
      t('onboarding.profileCompletion.socialMedia.invalid' as any),
    );
    if (options.requireValidFields && Object.keys(errors).length > 0) {
      setSocialFieldErrors(errors);
      return;
    }

    try {
      setSubmitting(true);
      await persistSocialMedia();
      setSocialFieldErrors({});
      setStepIndex((i) => i + 1);
    } catch (e: any) {
      Alert.alert(
        t('onboarding.profileCompletion.saveErrorTitle'),
        e?.message || t('onboarding.profileCompletion.saveErrorMessage'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function advanceInterest(opts: {
    requireCategorySelection: boolean;
  }) {
    if (step.kind !== 'interest' || submitting) return;
    if (
      opts.requireCategorySelection &&
      selectionsInCurrentCategory() < 1
    ) {
      return;
    }

    const isLast =
      interestCategoryIndex >= INTEREST_CATEGORY_IDS.length - 1;

    try {
      setSubmitting(true);
      if (isLast) {
        await leaveLastInterestCategory();
      } else {
        setStepIndex((i) => i + 1);
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

  async function goNext() {
    if (!isStepValid() || submitting) return;
    try {
      setSubmitting(true);
      if (step.kind === 'type') {
        await persistType();
        setStepIndex((i) => i + 1);
      } else if (step.kind === 'identity') {
        await persistName();
        setStepIndex((i) => i + 1);
      } else if (step.kind === 'photo') {
        await persistPhoto();
        setStepIndex((i) => i + 1);
      } else if (step.kind === 'details') {
        await persistDetails();
        setStepIndex((i) => i + 1);
      } else if (step.kind === 'interestsIntro') {
        setStepIndex((i) => i + 1);
      } else if (step.kind === 'interestsCelebration') {
        setStepIndex((i) => i + 1);
      } else if (step.kind === 'success') {
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
    if (step.kind === 'success' || stepIndex <= 0) return;
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
    step.kind === 'type' ||
    step.kind === 'identity' ||
    step.kind === 'photo' ||
    step.kind === 'details' ||
    step.kind === 'interestsIntro' ||
    step.kind === 'interestsCelebration';

  const animKey =
    step.kind === 'interest'
      ? `interest-${step.categoryId}`
      : step.kind === 'affiliation'
        ? `affiliation-${step.categoryId}`
        : step.kind;

  const displayName = [realName.trim(), lastName.trim()]
    .filter(Boolean)
    .join(' ');

  return (
    <RegistrationLayout
      footer={
        showFooterContinue ? (
          <PrimaryButton
            label={
              step.kind === 'interestsIntro'
                ? t('onboarding.profileCompletion.interestsIntro.cta')
                : step.kind === 'interestsCelebration'
                  ? t(
                      'onboarding.profileCompletion.interestsCelebration.continue',
                    )
                  : t('onboarding.profileCompletion.continue')
            }
            onPress={() => {
              void goNext();
            }}
            disabled={!isStepValid() || submitting}
            loading={submitting}
            disabledReason={blockedReason()}
          />
        ) : step.kind === 'interest' ? (
          <View style={styles.actionStack}>
            <PrimaryButton
              label={t('onboarding.profileCompletion.interests.next' as any)}
              onPress={() => {
                void advanceInterest({ requireCategorySelection: true });
              }}
              disabled={selectionsInCurrentCategory() < 1 || submitting}
              loading={submitting}
              disabledReason={
                selectionsInCurrentCategory() < 1
                  ? t(
                      'onboarding.profileCompletion.interests.pickRequired',
                    )
                  : undefined
              }
            />
            <SecondaryButton
              label={t('onboarding.profileCompletion.interests.skip' as any)}
              onPress={() => {
                if (submitting) return;
                void advanceInterest({ requireCategorySelection: false });
              }}
            />
          </View>
        ) : step.kind === 'affiliation' ? (
          <View style={styles.actionStack}>
            <PrimaryButton
              label={t('onboarding.profileCompletion.affiliations.next' as any)}
              onPress={() => {
                void advanceAffiliation();
              }}
              disabled={submitting}
              loading={submitting}
            />
            <SecondaryButton
              label={t('onboarding.profileCompletion.affiliations.skip' as any)}
              onPress={() => {
                if (submitting) return;
                void advanceAffiliation();
              }}
            />
          </View>
        ) : step.kind === 'socialMedia' ? (
          <View style={styles.actionStack}>
            <PrimaryButton
              label={t('onboarding.profileCompletion.socialMedia.next' as any)}
              onPress={() => {
                void advanceSocialMedia({ requireValidFields: true });
              }}
              disabled={submitting}
              loading={submitting}
            />
            <SecondaryButton
              label={t('onboarding.profileCompletion.socialMedia.skip' as any)}
              onPress={() => {
                if (submitting) return;
                void advanceSocialMedia({ requireValidFields: false });
              }}
            />
          </View>
        ) : step.kind === 'location' ? (
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
        ) : step.kind === 'notifications' ? (
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
        ) : step.kind === 'success' ? (
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
      {step.kind !== 'success' && progressPhase != null ? (
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
          <RegistrationProgress progress={progressValue} />
        </View>
      ) : null}

      <ScrollView
        style={styles.stepScroll}
        contentContainerStyle={styles.stepBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RegistrationFadeSlideIn animKey={animKey}>
          {step.kind === 'type' && (
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

          {step.kind === 'identity' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('onboarding.profileCompletion.identity.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('onboarding.profileCompletion.identity.subtitle')}
              </Text>
              <View style={styles.formBlock}>
                <FormInput
                  label={t('onboarding.profileCompletion.identity.nameLabel')}
                  placeholder={t(
                    'onboarding.profileCompletion.identity.namePlaceholder',
                  )}
                  value={firstName}
                  onChangeText={onFirstNameChange}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  textContentType="givenName"
                />
                <FormInput
                  label={t(
                    'onboarding.profileCompletion.identity.lastNameLabel',
                  )}
                  placeholder={t(
                    'onboarding.profileCompletion.identity.lastNamePlaceholder',
                  )}
                  value={lastName}
                  onChangeText={onLastNameChange}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  textContentType="familyName"
                />
              </View>
            </>
          )}

          {step.kind === 'photo' && (
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

          {step.kind === 'details' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('onboarding.profileCompletion.details.title' as any)}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('onboarding.profileCompletion.details.subtitle' as any)}
              </Text>
              <View style={styles.formStack}>
                <FormInput
                  label={t(
                    'onboarding.profileCompletion.details.occupation' as any,
                  )}
                  placeholder={t(
                    'onboarding.profileCompletion.details.occupationPlaceholder' as any,
                  )}
                  value={occupation}
                  onChangeText={setOccupation}
                  autoCapitalize="sentences"
                />
                {mode === 'professional' ? (
                  <FormInput
                    label={t(
                      'onboarding.profileCompletion.details.company' as any,
                    )}
                    placeholder={t(
                      'onboarding.profileCompletion.details.companyPlaceholder' as any,
                    )}
                    value={company}
                    onChangeText={setCompany}
                    autoCapitalize="words"
                  />
                ) : null}
                <FormInput
                  label={t('onboarding.profileCompletion.details.bio' as any)}
                  placeholder={t(
                    'onboarding.profileCompletion.details.bioPlaceholder' as any,
                  )}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={styles.bioInput}
                  autoCapitalize="sentences"
                />
              </View>
            </>
          )}

          {step.kind === 'interestsIntro' && (
            <View style={styles.centerBody}>
              <InterestsIntroVisual />
              <Text
                style={[
                  styles.introEyebrow,
                  { color: palette.primary },
                ]}
              >
                {t('onboarding.profileCompletion.interestsIntro.eyebrow')}
              </Text>
              <Text
                style={[
                  styles.title,
                  { color: palette.textPrimary, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.interestsIntro.title')}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: palette.textSecondary,
                    textAlign: 'center',
                    maxWidth: 320,
                  },
                ]}
              >
                {t('onboarding.profileCompletion.interestsIntro.body')}
              </Text>
              <Text
                style={[
                  styles.introSupport,
                  { color: palette.textMuted, textAlign: 'center' },
                ]}
              >
                {t('onboarding.profileCompletion.interestsIntro.supporting')}
              </Text>
            </View>
          )}

          {step.kind === 'interest' && (() => {
            const interestCategory = getOnboardingCategory(step.categoryId);
            const hierarchical = isHierarchicalInterestCategory(interestCategory);
            const activeGroupId = hierarchical
              ? resolveActiveGroupId(
                  interestCategory,
                  activeInterestGroupByCategory[step.categoryId],
                )
              : undefined;
            return (
              <OnboardingInterestCategoryPanel
                categoryId={step.categoryId}
                selected={selectedInterests}
                onChangeSelected={setSelectedInterests}
                activeGroupId={activeGroupId}
                onActiveGroupChange={(groupId) => {
                  setActiveInterestGroupByCategory((prev) => ({
                    ...prev,
                    [step.categoryId]: groupId,
                  }));
                }}
              />
            );
          })()}

          {step.kind === 'interestsCelebration' && (
            <InterestsCelebrationStep
              selected={selectedInterests}
              continueTarget="affiliations"
            />
          )}

          {step.kind === 'affiliation' && (
            <OnboardingAffiliationCategoryPanel
              categoryId={step.categoryId}
              selected={selectedAffiliations}
              onChangeSelected={setSelectedAffiliations}
            />
          )}

          {step.kind === 'socialMedia' && (
            <OnboardingSocialMediaStep
              values={socialDraft}
              custom={socialCustom}
              onChangeValues={setSocialDraft}
              onChangeCustom={setSocialCustom}
              fieldErrors={socialFieldErrors}
              onClearFieldError={(id) => {
                setSocialFieldErrors((prev) => {
                  if (!prev[id]) return prev;
                  const next = { ...prev };
                  delete next[id];
                  return next;
                });
              }}
            />
          )}

          {step.kind === 'location' && (
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

          {step.kind === 'notifications' && (
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

          {step.kind === 'success' && (
            <View style={styles.centerBody}>
              <View style={styles.markWrap}>
                <AnimatedNearsyLogo size={54} />
              </View>
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
              {displayName ? (
                <Text
                  style={[
                    styles.successName,
                    { color: palette.textPrimary },
                  ]}
                >
                  {displayName}
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
  formBlock: { marginTop: spacing.xxl, gap: spacing.lg },
  formStack: { gap: spacing.lg, marginTop: spacing.xxl },
  bioInput: {
    minHeight: 110,
    paddingTop: 14,
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
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  introEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  introSupport: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.45,
    marginTop: spacing.xl,
    maxWidth: 300,
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
