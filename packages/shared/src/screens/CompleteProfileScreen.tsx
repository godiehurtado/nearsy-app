import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebaseAuth } from '../config/firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';

import ProfileQuickActions from '../components/ProfileQuickActions';
import OwnProfileHero from '../components/profile/OwnProfileHero';
import OwnProfileDetails from '../components/profile/OwnProfileDetails';
import OwnProfileSaveBar from '../components/profile/OwnProfileSaveBar';
import {
  InterestAffiliations,
  SocialLinks,
  GalleryPhoto,
} from '../types/profile';
import {
  getUserProfile,
  updateUserProfilePartial,
} from '../services/firestoreService';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  applyActiveProfileModeResponseToUserDoc,
  createActiveProfileModeSwitchSession,
  presentActiveProfileModeError,
} from '../visibility/activeProfileModeSync';
import { uploadProfileImage } from '../services/storageService';
import {
  consumePendingSocialProfilePrefill,
  clearPendingSocialProfilePrefill,
  mergeCompleteProfilePrefill,
} from '../authentication/social';
import { resolveModePresentation, type ProfileMode } from '../profile/profileModeFields';
import {
  buildOwnProfileSavePatch,
  buildPersistedOwnProfileDraftAfterUpload,
  classifyOwnProfileLoadResult,
  createOwnProfileDraftFromPresentation,
  createOwnProfileSnapshot,
  decideDirtyNavigationGuard,
  isLocalProfileImageUri,
  isOwnProfileDraftDirty,
  isOwnProfileEditorWritable,
  isOwnProfileSaveAuthorized,
  validateOwnProfileDraft,
  type OwnProfileDraft,
  type OwnProfileLifecycleAuth,
  type OwnProfileValidationField,
} from '../profile/ownProfileEditorState';
import { extractOwnProfileInterestSummaryCounts } from '../interests/postCrjInterestEditor';
import { extractOwnProfileAffiliationSummaryCounts } from '../affiliations/postCrjAffiliationEditor';
import { extractOwnProfileSocialSummaryCounts } from '../social/postCrjSocialEditor';
import { extractOwnProfileGallerySummaryCounts } from '../gallery/postCrjGalleryEditor';

const NAME_MAX = 40;
const OCCUPATION_MAX = 60;
const COMPANY_MAX = 60;
const BIO_MAX = 200;

const BLOCKED_WORDS = [
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'nigger',
  'nigga',
  'faggot',
  'slut',
  'whore',
  'puta',
  'mierda',
  'idiota',
  'imbecil',
  'malparido',
  'gonorrea',
];

function normalizeModerationText(value: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function containsObjectionableContent(value: string) {
  const normalized = normalizeModerationText(value);
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
}

export default function CompleteProfileScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useAppTheme();

  const scrollRef = useRef<ScrollView | null>(null);
  const modeSwitchSessionRef = useRef(createActiveProfileModeSwitchSession());
  const mountedRef = useRef(true);

  const getUid = () =>
    route?.params?.uid ?? firebaseAuth.currentUser?.uid ?? null;

  const [realName, setRealName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [mode, setMode] = useState<'personal' | 'professional' | null>(null);
  const [occupation, setOccupation] = useState('');
  const [company, setCompany] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [personalAff, setPersonalAff] = useState<InterestAffiliations>({});
  const [professionalAff, setProfessionalAff] = useState<InterestAffiliations>(
    {},
  );
  const [socialLinksPersonal, setsocialLinksPersonal] = useState<SocialLinks>(
    {},
  );
  const [socialLinksProfessional, setsocialLinksProfessional] =
    useState<SocialLinks>({});
  const [personalGallery, setPersonalGallery] = useState<GalleryPhoto[]>([]);
  const [professionalGallery, setProfessionalGallery] = useState<
    GalleryPhoto[]
  >([]);

  type AffiliationItem = {
    category: 'sportsTeam' | 'college' | 'hometown' | 'organization';
    label: string;
    imageUrl: string | null;
  };

  const [personalAffiliations, setPersonalAffiliations] = useState<
    AffiliationItem[]
  >([]);
  const [professionalAffiliations, setProfessionalAffiliations] = useState<
    AffiliationItem[]
  >([]);
  const [personalInterestsSummaryCount, setPersonalInterestsSummaryCount] =
    useState(0);
  const [professionalInterestsSummaryCount, setProfessionalInterestsSummaryCount] =
    useState(0);
  const [personalAffiliationsSummaryCount, setPersonalAffiliationsSummaryCount] =
    useState(0);
  const [professionalAffiliationsSummaryCount, setProfessionalAffiliationsSummaryCount] =
    useState(0);
  const [personalSocialSummaryCount, setPersonalSocialSummaryCount] = useState(0);
  const [professionalSocialSummaryCount, setProfessionalSocialSummaryCount] =
    useState(0);
  const [personalGallerySummaryCount, setPersonalGallerySummaryCount] =
    useState(0);
  const [professionalGallerySummaryCount, setProfessionalGallerySummaryCount] =
    useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [modeSwitchLoading, setModeSwitchLoading] = useState(false);
  const [profileDoc, setProfileDoc] = useState<Record<string, unknown> | null>(
    null,
  );
  const [lifecycleAuth, setLifecycleAuth] =
    useState<OwnProfileLifecycleAuth>('unresolved');
  const bypassDirtyNavigationRef = useRef(false);

  const applyDraftToForm = useCallback((draft: OwnProfileDraft) => {
    setRealName(draft.realName);
    setLastName(draft.lastName);
    setOccupation(draft.occupation);
    setBio(draft.bio);
    setCompany(draft.company);
    setProfileImage(draft.profileImage);
  }, []);

  const applyModeFields = useCallback(
    (data: Record<string, unknown> | null | undefined, nextMode: ProfileMode) => {
      const presentation = resolveModePresentation(data, nextMode);
      applyDraftToForm(createOwnProfileDraftFromPresentation(presentation));
    },
    [applyDraftToForm],
  );

  const [savedSnapshot, setSavedSnapshot] = useState<OwnProfileDraft | null>(
    null,
  );
  const savedSnapshotRef = useRef<OwnProfileDraft | null>(null);
  const isDirtyRef = useRef(false);

  const commitSnapshot = useCallback((draft: OwnProfileDraft) => {
    const snapshot = createOwnProfileSnapshot(draft);
    savedSnapshotRef.current = snapshot;
    setSavedSnapshot(snapshot);
  }, []);

  const editorDraft = useMemo<OwnProfileDraft>(
    () => ({
      realName,
      lastName,
      profileImage,
      occupation,
      bio,
      company,
    }),
    [realName, lastName, profileImage, occupation, bio, company],
  );

  const isDirty = isOwnProfileDraftDirty(editorDraft, savedSnapshot, mode);
  if (!bypassDirtyNavigationRef.current) {
    isDirtyRef.current = isDirty;
  }
  const editorWritable = isOwnProfileEditorWritable(lifecycleAuth);
  const draftValidation = validateOwnProfileDraft(editorDraft, mode);
  const saveDisabled =
    !isDirty || isLoading || draftValidation.ok === false || !editorWritable;

  const restoreSavedSnapshot = useCallback(() => {
    const snapshot = savedSnapshotRef.current;
    if (!snapshot) return;
    applyDraftToForm(snapshot);
  }, [applyDraftToForm]);

  const confirmDiscardChanges = useCallback(
    (onDiscard: () => void) => {
      Alert.alert(t('profile.discard.title'), t('profile.discard.body'), [
        { text: t('profile.discard.stay'), style: 'cancel' },
        {
          text: t('profile.discard.discard'),
          style: 'destructive',
          onPress: () => {
            isDirtyRef.current = false;
            restoreSavedSnapshot();
            onDiscard();
          },
        },
      ]);
    },
    [restoreSavedSnapshot, t],
  );

  const redirectIncompleteToCrj = useCallback(
    (uid: string) => {
      const names = navigation.getState?.()?.routeNames ?? [];
      if (names.includes('ProfileCompletion')) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'ProfileCompletion', params: { uid } }],
        });
        return true;
      }
      const parent = navigation.getParent?.();
      const parentNames = parent?.getState?.()?.routeNames ?? [];
      if (parentNames.includes('ProfileCompletion')) {
        parent.reset({
          index: 0,
          routes: [{ name: 'ProfileCompletion', params: { uid } }],
        });
        return true;
      }
      return false;
    },
    [navigation],
  );

  const loadProfile = useCallback(async () => {
    const uid = getUid();
    if (!uid) return;

    try {
      setIsLoading(true);
      setLifecycleAuth('unresolved');
      const existing = await getUserProfile(uid);
      let socialPrefill = null;
      try {
        socialPrefill = consumePendingSocialProfilePrefill(uid);
      } catch {
        socialPrefill = null;
      }

      const classified = classifyOwnProfileLoadResult({
        phase: 'success',
        doc: existing,
      });

      if (classified.kind === 'redirect_incomplete') {
        setLifecycleAuth('incomplete');
        const redirected = redirectIncompleteToCrj(uid);
        if (!redirected) {
          setLifecycleAuth('blocked');
        }
        return;
      }

      if (classified.kind !== 'allow' || !existing) {
        setLifecycleAuth('blocked');
        return;
      }

      setLifecycleAuth('allowed');
      setProfileDoc(existing as any);

      const currentMode: ProfileMode =
        existing.mode === 'professional' ? 'professional' : 'personal';
      let presentation = resolveModePresentation(existing as any, currentMode);
      let nextRealName = presentation.realName ?? '';
      let nextProfileImage = presentation.profileImage ?? null;

      if (socialPrefill) {
        try {
          const merged = mergeCompleteProfilePrefill(
            {
              realName: nextRealName,
              profileImage: nextProfileImage,
              email: (existing as any).email ?? null,
            },
            socialPrefill,
          );
          nextRealName = merged.realName ?? nextRealName;
          nextProfileImage = merged.profileImage ?? nextProfileImage;
        } catch {
          // Fail-soft: keep Firestore values.
        }
      }

      const loadedDoc = {
        ...(existing as any),
        profiles: {
          ...((existing as any).profiles ?? {}),
          [currentMode]: {
            ...presentation,
            realName: nextRealName,
            profileImage: nextProfileImage,
          },
        },
      };

      setMode(currentMode);
      applyModeFields(loadedDoc, currentMode);

      const loadedDraft = createOwnProfileDraftFromPresentation({
        ...presentation,
        realName: nextRealName,
        profileImage: nextProfileImage,
      });
      applyDraftToForm(loadedDraft);
      commitSnapshot(loadedDraft);

      const normalizeAff = (aff: any): InterestAffiliations =>
        Object.fromEntries(
          Object.entries(aff ?? {}).map(([k, v]) => [
            k,
            Array.isArray(v) ? v : [],
          ]),
        ) as InterestAffiliations;

      setPersonalAff(
        normalizeAff((existing as any).personalInterestAffiliations),
      );
      setProfessionalAff(
        normalizeAff((existing as any).professionalInterestAffiliations),
      );
      setsocialLinksPersonal((existing as any).socialLinksPersonal ?? {});
      setsocialLinksProfessional(
        (existing as any).socialLinksProfessional ?? {},
      );
      setPersonalGallery(
        Array.isArray((existing as any).personalGallery)
          ? (existing as any).personalGallery
          : [],
      );
      setProfessionalGallery(
        Array.isArray((existing as any).professionalGallery)
          ? (existing as any).professionalGallery
          : [],
      );
      setPersonalAffiliations(
        Array.isArray((existing as any).personalAffiliations)
          ? (existing as any).personalAffiliations
          : [],
      );
      setProfessionalAffiliations(
        Array.isArray((existing as any).professionalAffiliations)
          ? (existing as any).professionalAffiliations
          : [],
      );

      const doc = existing as Record<string, unknown>;
      const interestCounts = extractOwnProfileInterestSummaryCounts(doc);
      setPersonalInterestsSummaryCount(interestCounts.personal);
      setProfessionalInterestsSummaryCount(interestCounts.professional);
      const affiliationCounts = extractOwnProfileAffiliationSummaryCounts(doc);
      setPersonalAffiliationsSummaryCount(affiliationCounts.personal);
      setProfessionalAffiliationsSummaryCount(affiliationCounts.professional);
      const socialCounts = extractOwnProfileSocialSummaryCounts(doc);
      setPersonalSocialSummaryCount(socialCounts.personal);
      setProfessionalSocialSummaryCount(socialCounts.professional);
      const galleryCounts = extractOwnProfileGallerySummaryCounts(doc);
      setPersonalGallerySummaryCount(galleryCounts.personal);
      setProfessionalGallerySummaryCount(galleryCounts.professional);
    } catch {
      setLifecycleAuth('error');
    } finally {
      setIsLoading(false);
    }
  }, [
    route?.params?.uid,
    applyModeFields,
    applyDraftToForm,
    commitSnapshot,
    redirectIncompleteToCrj,
  ]);

  const refreshProfileSummaries = useCallback(async () => {
    const uid = getUid();
    if (!uid) return;

    try {
      const existing = await getUserProfile(uid);
      if (!existing) return;
      const doc = existing as Record<string, unknown>;
      const interestCounts = extractOwnProfileInterestSummaryCounts(doc);
      const affiliationCounts = extractOwnProfileAffiliationSummaryCounts(doc);
      const socialCounts = extractOwnProfileSocialSummaryCounts(doc);
      const galleryCounts = extractOwnProfileGallerySummaryCounts(doc);
      if (!mountedRef.current) return;
      setPersonalInterestsSummaryCount(interestCounts.personal);
      setProfessionalInterestsSummaryCount(interestCounts.professional);
      setPersonalAffiliationsSummaryCount(affiliationCounts.personal);
      setProfessionalAffiliationsSummaryCount(affiliationCounts.professional);
      setPersonalSocialSummaryCount(socialCounts.personal);
      setProfessionalSocialSummaryCount(socialCounts.professional);
      setPersonalGallerySummaryCount(galleryCounts.personal);
      setProfessionalGallerySummaryCount(galleryCounts.professional);
    } catch {
      // Fail-soft: keep prior summary counts.
    }
  }, [route?.params?.uid]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      if (!isDirtyRef.current) {
        void loadProfile();
      } else {
        void refreshProfileSummaries();
      }
      return () => {
        mountedRef.current = false;
      };
    }, [loadProfile, refreshProfileSummaries]),
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener(
      'beforeRemove',
      (e: { preventDefault: () => void; data: { action: unknown } }) => {
        const decision = decideDirtyNavigationGuard({
          isDirty: isDirtyRef.current,
          bypass: bypassDirtyNavigationRef.current,
        });
        if (decision === 'allow') return;
        e.preventDefault();
        confirmDiscardChanges(() => {
          bypassDirtyNavigationRef.current = true;
          isDirtyRef.current = false;
          navigation.dispatch(e.data.action as never);
          setTimeout(() => {
            bypassDirtyNavigationRef.current = false;
          }, 0);
        });
      },
    );
    return unsubscribe;
  }, [navigation, confirmDiscardChanges]);

  const interestsCount =
    (mode ?? 'personal') === 'professional'
      ? professionalInterestsSummaryCount
      : personalInterestsSummaryCount;

  const socialCount =
    (mode ?? 'personal') === 'professional'
      ? professionalSocialSummaryCount
      : personalSocialSummaryCount;

  const photosCount =
    (mode ?? 'personal') === 'professional'
      ? professionalGallerySummaryCount
      : personalGallerySummaryCount;

  const affiliationsCount =
    (mode ?? 'personal') === 'professional'
      ? professionalAffiliationsSummaryCount
      : personalAffiliationsSummaryCount;

  const summaryForCount = useCallback(
    (count: number) =>
      count > 0
        ? t('profile.quickActions.configured', { count })
        : t('profile.quickActions.empty'),
    [t],
  );

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          t('profile.permission.required'),
          t('profile.photo.permissionPhotos'),
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        setProfileImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t('common.error'), t('profile.errors.pickImage'));
    }
  };

  const takeProfilePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          t('profile.permission.required'),
          t('profile.photo.permissionCamera'),
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets.length > 0) {
        setProfileImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t('common.error'), t('profile.errors.openCamera'));
    }
  };

  const openProfileImageOptions = () => {
    if (!editorWritable) return;
    Alert.alert(t('profile.photo.title'), t('profile.photo.body'), [
      { text: t('profile.photo.take'), onPress: takeProfilePhoto },
      { text: t('profile.photo.library'), onPress: pickImage },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const runModeSwitch = async () => {
    const confirmedMode: ProfileMode =
      (mode ?? 'personal') === 'professional' ? 'professional' : 'personal';
    const targetMode: ProfileMode =
      confirmedMode === 'personal' ? 'professional' : 'personal';

    if (modeSwitchLoading || modeSwitchSessionRef.current.isBusy()) {
      return;
    }

    const uid = getUid();
    if (!uid) return;

    setModeSwitchLoading(true);
    try {
      const client = await getVisibilityDiscoveryClient();
      const result = await modeSwitchSessionRef.current.switchMode(targetMode, {
        client,
        confirmedMode,
        uid,
      });

      if (!mountedRef.current || getUid() !== uid) {
        return;
      }

      if ('kind' in result) {
        return;
      }

      if (result.ok === false) {
        const presentation = presentActiveProfileModeError(t, result.error);
        Alert.alert(presentation.title, presentation.userMessage);
        return;
      }

      if (!mountedRef.current || getUid() !== uid) {
        return;
      }

      const { response } = result;
      const nextDoc = applyActiveProfileModeResponseToUserDoc(
        profileDoc ?? {},
        response,
      );
      setMode(response.mode);
      applyModeFields(nextDoc, response.mode);
      setProfileDoc(nextDoc);
      commitSnapshot(
        createOwnProfileDraftFromPresentation(
          resolveModePresentation(nextDoc, response.mode),
        ),
      );

      if (!response.targetProfileComplete) {
        Alert.alert(
          t('activeProfileMode.errors.title'),
          t('activeProfileMode.incomplete.message'),
        );
      }
    } catch (e) {
      if (__DEV__) {
        console.error('[CompleteProfile] Error switching mode', e);
      }
      Alert.alert(
        t('activeProfileMode.errors.title'),
        t('activeProfileMode.errors.generic'),
      );
    } finally {
      if (mountedRef.current) {
        setModeSwitchLoading(false);
      }
    }
  };

  const handleToggleMode = () => {
    if (!editorWritable) return;
    if (modeSwitchLoading || modeSwitchSessionRef.current.isBusy()) {
      return;
    }
    if (isDirtyRef.current) {
      confirmDiscardChanges(() => {
        void runModeSwitch();
      });
      return;
    }
    void runModeSwitch();
  };

  const validationMessage = (field: OwnProfileValidationField) => {
    switch (field) {
      case 'realName':
        return t('profile.validation.realName');
      case 'lastName':
        return t('profile.validation.lastName');
      case 'profileImage':
        return t('profile.validation.profileImage');
      case 'occupation':
        return t('profile.validation.occupation');
      case 'bio':
        return t('profile.validation.biography');
      case 'company':
        return t('profile.validation.company');
      case 'mode':
        return t('profile.validation.mode');
      default:
        return t('profile.errors.saveFailed');
    }
  };

  const validateModerationFields = () => {
    const fieldsToCheck = [
      { label: t('profile.fields.realName'), value: realName },
      { label: t('profile.fields.lastName'), value: lastName },
      { label: t('profile.fields.occupation'), value: occupation },
      { label: t('profile.fields.biography'), value: bio },
      { label: t('profile.fields.company'), value: company },
    ];

    const offendingField = fieldsToCheck.find(
      (f) => !!f.value?.trim() && containsObjectionableContent(f.value),
    );

    if (offendingField) {
      Alert.alert(
        t('common.error'),
        t('profile.validation.contentNotAllowed', {
          field: offendingField.label,
        }),
      );
      return false;
    }

    return true;
  };

  const persistOwnProfile = async () => {
    try {
      if (!isOwnProfileSaveAuthorized(lifecycleAuth)) {
        if (lifecycleAuth === 'incomplete') {
          const uid = getUid();
          if (uid) {
            const redirected = redirectIncompleteToCrj(uid);
            if (!redirected) setLifecycleAuth('blocked');
          }
        }
        return;
      }

      const validation = validateOwnProfileDraft(editorDraft, mode);
      if (validation.ok === false) {
        Alert.alert(t('common.error'), validationMessage(validation.field));
        return;
      }
      if (!mode) return;

      if (!validateModerationFields()) {
        return;
      }

      setIsLoading(true);
      const uid = getUid();
      if (!uid) throw new Error('User not authenticated.');

      let uploadedImageUrl: string | null = null;
      if (isLocalProfileImageUri(profileImage)) {
        uploadedImageUrl = await uploadProfileImage(uid, profileImage!);
      } else {
        uploadedImageUrl = profileImage ?? null;
      }

      if (!uploadedImageUrl || isLocalProfileImageUri(uploadedImageUrl)) {
        throw new Error(t('profile.validation.profileImage'));
      }

      const persistedDraft = buildPersistedOwnProfileDraftAfterUpload(
        editorDraft,
        uploadedImageUrl,
      );
      const modePatch = buildOwnProfileSavePatch({
        mode,
        draft: persistedDraft,
      });

      await updateUserProfilePartial(uid, modePatch);

      applyDraftToForm(persistedDraft);
      commitSnapshot(persistedDraft);

      setProfileDoc((prev) => ({
        ...(prev ?? {}),
        ...modePatch,
        profiles: {
          ...((prev?.profiles as any) ?? {}),
          [mode]: {
            ...(((prev?.profiles as any)?.[mode] as object) ?? {}),
            realName: persistedDraft.realName,
            lastName: persistedDraft.lastName,
            profileImage: persistedDraft.profileImage,
            occupation: persistedDraft.occupation,
            bio: persistedDraft.bio,
            ...(mode === 'professional'
              ? { company: persistedDraft.company }
              : {}),
          },
        },
      }));

      clearPendingSocialProfilePrefill();
      Keyboard.dismiss();
    } catch (e: any) {
      Alert.alert(
        t('common.error'),
        e?.message || t('profile.errors.saveFailed'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    await persistOwnProfile();
  };

  const handleCancel = () => {
    if (!isDirtyRef.current) return;
    confirmDiscardChanges(() => {});
  };

  const goToGallery = () => {
    const uid = getUid();
    if (!uid) return;

    navigation.navigate('Gallery', {
      uid,
      mode: mode ?? 'personal',
    });
  };

  const goToProfileExtraScreen = (
    screen: 'Interests',
  ) => {
    const uid = getUid();
    if (!uid) return;

    const activeMode = (mode ?? 'personal') as 'personal' | 'professional';

    const currentRouteNames = navigation.getState?.()?.routeNames ?? [];

    if (currentRouteNames.includes(screen)) {
      navigation.navigate(screen, { uid, mode: activeMode });
      return;
    }

    navigation.getParent?.()?.navigate('Profile', {
      screen,
      params: { uid, mode: activeMode },
    });
  };

  const goToSocialMedia = () => {
    const uid = getUid();
    if (!uid) return;

    navigation.navigate('SocialMedia', {
      uid,
      mode: mode ?? 'personal',
    });
  };

  const goToAffiliations = () => {
    const uid = getUid();
    if (!uid) return;

    navigation.navigate('Affiliations', {
      uid,
      mode: mode ?? 'personal',
    });
  };

  const activeMode = (mode ?? 'personal') as 'personal' | 'professional';
  const modeContextLabel =
    activeMode === 'professional'
      ? t('profile.mode.contextProfessional')
      : t('profile.mode.contextPersonal');

  const lifecycleMessage =
    lifecycleAuth === 'error'
      ? t('profile.lifecycle.loadError')
      : lifecycleAuth === 'blocked'
        ? t('profile.lifecycle.blocked')
        : null;

  const showInitialLoading = lifecycleAuth === 'unresolved';
  const showContent = editorWritable && !showInitialLoading;
  const bottomBarInset =
    insets.bottom > 0 ? insets.bottom + spacing.sm : spacing.lg;

  const quickActions = [
    {
      id: 'interests' as const,
      icon: 'sparkles-outline' as const,
      title: t('profile.quickActions.interests'),
      subtitle: summaryForCount(interestsCount),
      accessibilityLabel: t('profile.quickActions.openA11y', {
        section: t('profile.quickActions.interests'),
      }),
      onPress: () => goToProfileExtraScreen('Interests'),
    },
    {
      id: 'affiliations' as const,
      icon: 'ribbon-outline' as const,
      title: t('profile.quickActions.affiliations'),
      subtitle: summaryForCount(affiliationsCount),
      accessibilityLabel: t('profile.quickActions.openA11y', {
        section: t('profile.quickActions.affiliations'),
      }),
      onPress: () => goToAffiliations(),
    },
    {
      id: 'social' as const,
      icon: 'share-social-outline' as const,
      title: t('profile.quickActions.socialMedia'),
      subtitle: summaryForCount(socialCount),
      accessibilityLabel: t('profile.quickActions.openA11y', {
        section: t('profile.quickActions.socialMedia'),
      }),
      onPress: () => goToSocialMedia(),
    },
    {
      id: 'gallery' as const,
      icon: 'images-outline' as const,
      title: t('profile.quickActions.gallery'),
      subtitle: summaryForCount(photosCount),
      accessibilityLabel: t('profile.quickActions.openA11y', {
        section: t('profile.quickActions.gallery'),
      }),
      onPress: () => goToGallery(),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={{
            paddingTop: insets.top + spacing.md,
            paddingBottom: isDirty ? 120 + bottomBarInset : spacing.xxxl,
          }}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ top: insets.top }}
        >
          <Text
            accessibilityRole="header"
            style={[styles.screenTitle, { color: palette.textPrimary }]}
          >
            {t('profile.myProfileTitle')}
          </Text>

          {showInitialLoading ? (
            <View
              style={styles.centered}
              accessibilityLiveRegion="polite"
              accessibilityLabel={t('profile.lifecycle.loading')}
            >
              <ActivityIndicator size="large" color={palette.primary} />
              <Text
                style={[styles.lifecycleText, { color: palette.textSecondary }]}
              >
                {t('profile.lifecycle.loading')}
              </Text>
            </View>
          ) : lifecycleMessage ? (
            <View style={styles.centered} accessibilityRole="alert">
              <Text
                style={[styles.lifecycleText, { color: palette.textSecondary }]}
              >
                {lifecycleMessage}
              </Text>
            </View>
          ) : showContent ? (
            <>
              <OwnProfileHero
                profileImage={profileImage}
                realName={realName}
                lastName={lastName}
                mode={activeMode}
                modeContextLabel={modeContextLabel}
                personalLabel={t('profile.mode.personal')}
                professionalLabel={t('profile.mode.professional')}
                changePhotoLabel={t('profile.changePhoto')}
                changePhotoA11y={t('profile.changePhotoA11y')}
                modeSwitchA11y={t('profile.mode.switchA11y')}
                editorWritable={editorWritable}
                modeSwitchLoading={modeSwitchLoading}
                onChangePhoto={openProfileImageOptions}
                onToggleMode={handleToggleMode}
              />

              <OwnProfileDetails
                mode={activeMode}
                values={{
                  realName,
                  lastName,
                  occupation,
                  bio,
                  company,
                }}
                labels={{
                  sectionTitle: t('profile.sections.details'),
                  realName: t('profile.fields.realName'),
                  lastName: t('profile.fields.lastName'),
                  occupation: t('profile.fields.occupation'),
                  biography: t('profile.fields.biography'),
                  company: t('profile.fields.company'),
                }}
                placeholders={{
                  realName: t('profile.placeholders.realName'),
                  lastName: t('profile.placeholders.lastName'),
                  occupation: t('profile.placeholders.occupation'),
                  biography: t('profile.placeholders.biography'),
                  company: t('profile.placeholders.company'),
                }}
                editorWritable={editorWritable}
                bioMaxLength={BIO_MAX}
                realNameMaxLength={NAME_MAX}
                lastNameMaxLength={NAME_MAX}
                occupationMaxLength={OCCUPATION_MAX}
                companyMaxLength={COMPANY_MAX}
                onChangeRealName={setRealName}
                onChangeLastName={setLastName}
                onChangeOccupation={setOccupation}
                onChangeBio={setBio}
                onChangeCompany={setCompany}
              />

              <ProfileQuickActions
                sectionTitle={t('profile.sections.content')}
                actions={quickActions}
              />
            </>
          ) : null}
        </ScrollView>

        <OwnProfileSaveBar
          visible={editorWritable && isDirty}
          saveLabel={t('profile.save')}
          cancelLabel={t('profile.cancel')}
          saving={isLoading}
          saveDisabled={saveDisabled}
          cancelDisabled={isLoading}
          bottomInset={insets.bottom}
          onSave={handleSave}
          onCancel={handleCancel}
        />

        {isLoading && lifecycleAuth === 'allowed' ? (
          <View
            style={[styles.savingOverlay, { backgroundColor: palette.background }]}
            pointerEvents="auto"
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('profile.saving')}
          >
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={[styles.savingText, { color: palette.textSecondary }]}>
              {t('profile.saving')}
            </Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      <View
        pointerEvents="none"
        style={[
          styles.statusBarOverlay,
          {
            height: insets.top,
            backgroundColor: palette.background,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  statusBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  screenTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.sm,
  },
  centered: {
    paddingHorizontal: screenPadding.horizontal,
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  lifecycleText: {
    fontSize: fontSize.md,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
    gap: spacing.md,
  },
  savingText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
