// src/screens/CompleteProfileScreen.tsx  ✅ RNFirebase-only
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  PixelRatio,
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
} from 'react-native';

import ModeSwitch from '../components/ModeSwitch';
import ProfileQuickActions from '../components/ProfileQuickActions';
import TopHeader from '../components/TopHeader';
import ColorPickerModal from '../components/ColorPickerModal';
import {
  InterestAffiliations,
  SocialLinks,
  GalleryPhoto,
} from '../types/profile';

import {
  saveCompleteProfile,
  getUserProfile,
  updateUserMode,
} from '../services/firestoreService';

import {
  uploadProfileImage,
  uploadTopBarImage,
} from '../services/storageService';

type TopBarMode = 'color' | 'image';

// límites de caracteres
const NAME_MAX = 40;
const OCCUPATION_MAX = 60;
const COMPANY_MAX = 60;
const STATUS_MAX = 50;
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

const COMPLETE_PROFILE_GUIDE_STEPS = [
  {
    title: 'Open profile visuals',
    description: 'Tap the camera button to open your profile visual options.',
  },
  {
    title: 'Add your profile photo',
    description:
      'Tap Change profile photo and choose a photo for your profile.',
  },
  {
    title: 'Choose your top bar style',
    description: 'Use Color or Image to personalize the top of your profile.',
  },
  {
    title: 'Enter your name',
    description: 'Use your real name so your profile feels trustworthy.',
  },
  {
    title: 'Add your occupation',
    description: 'Tell others what you do or what describes you best.',
  },
  {
    title: 'Write a short status',
    description: 'Add a quick phrase that represents you today.',
  },
  {
    title: 'Write your biography',
    description: 'Share a short intro about yourself.',
  },
  {
    title: 'Choose your profile mode',
    description:
      'Select Social or Professional depending on how you want to connect.',
  },
  {
    title: 'Tap Affiliations',
    description:
      'Tap Affiliations to add teams, schools, hometowns, or organizations.',
  },
  {
    title: 'Tap Interests',
    description: 'Tap Interests to choose topics that represent you.',
  },
  {
    title: 'Go to Social Media',
    description: 'Open Social media to connect your profiles.',
  },
  {
    title: 'Add photos',
    description: 'Add photos to personalize your profile.',
  },
  {
    title: 'Save your profile',
    description: 'Tap Save changes to finish your profile.',
  },
];

/** Guide step index → audio asset (iOS guide; replicate on Android later). */
const COMPLETE_PROFILE_GUIDE_AUDIO: (number | undefined)[] = [
  require('../assets/audio/CompleteProfile_Step1.mp3'),
  require('../assets/audio/CompleteProfile_Step2.mp3'),
  require('../assets/audio/CompleteProfile_Step3.mp3'),
  require('../assets/audio/CompleteProfile_Step4.mp3'),
  require('../assets/audio/CompleteProfile_Step5.mp3'),
  require('../assets/audio/CompleteProfile_Step6.mp3'),
  require('../assets/audio/CompleteProfile_Step7.mp3'),
  require('../assets/audio/CompleteProfile_Step8.mp3'),
  require('../assets/audio/CompleteProfile_TabAffiliations.mp3'),
  require('../assets/audio/CompleteProfile_TabInterests.mp3'),
  require('../assets/audio/CompleteProfile_GoToSocialMedia.mp3'),
  undefined,
  require('../assets/audio/CompleteProfile_Step10.mp3'),
];

export default function CompleteProfileScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const isLargeText = PixelRatio.getFontScale() >= 1.2;

  const scrollRef = useRef<ScrollView | null>(null);

  const realNameInputRef = useRef<RNTextInput | null>(null);
  const occupationInputRef = useRef<RNTextInput | null>(null);
  const statusInputRef = useRef<RNTextInput | null>(null);
  const bioInputRef = useRef<RNTextInput | null>(null);

  const guideYPositions = useRef<Record<number, number>>({});
  const guideFieldRefs = useRef<Record<number, View | null>>({});
  const guideSoundRef = useRef<Audio.Sound | null>(null);
  const guideAudioModeReadyRef = useRef(false);

  // ✅ Helper para obtener el UID (por route.params o por RNFirebase)
  const getUid = () =>
    route?.params?.uid ?? firebaseAuth.currentUser?.uid ?? null;

  // Perfil
  const [realName, setRealName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'personal' | 'professional' | null>(null);
  const [occupation, setOccupation] = useState('');
  const [company, setCompany] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [topBarMode, setTopBarMode] = useState<TopBarMode>('color');

  // Intereses
  const [personalAff, setPersonalAff] = useState<InterestAffiliations>({});
  const [professionalAff, setProfessionalAff] = useState<InterestAffiliations>(
    {},
  );

  // Social links por modo
  const [socialLinksPersonal, setsocialLinksPersonal] = useState<SocialLinks>(
    {},
  );
  const [socialLinksProfessional, setsocialLinksProfessional] =
    useState<SocialLinks>({});

  // Gallery por modo
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

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [guideDismissed, setGuideDismissed] = useState(false);

  // Campo actualmente en edición
  type FieldId =
    | 'realName'
    | 'occupation'
    | 'status'
    | 'bio'
    | 'company'
    | null;
  const [activeField, setActiveField] = useState<FieldId>(null);

  // Mostrar bloque de cámara + topbar
  const [showTopBarControls, setShowTopBarControls] = useState(false);

  // (compat)
  const [interestAffiliations] = useState<InterestAffiliations>({});

  // Cargar perfil existente
  const loadProfile = useCallback(async () => {
    const uid = getUid();
    if (!uid) return;

    try {
      setIsLoading(true);
      const existing = await getUserProfile(uid);

      if (existing && existing.realName != '') {
        setRealName(existing.realName ?? '');
        setStatus((existing as any).status ?? '');
        setBio(existing.bio ?? '');
        const currentMode = existing.mode ?? 'personal';
        setMode(currentMode);

        setOccupation(existing.occupation ?? '');
        setCompany(existing.company ?? '');
        setProfileImage(existing.profileImage ?? null);
        setTopBarColor(existing.topBarColor ?? '#3B5A85');
        setTopBarImage((existing as any).topBarImage ?? null);
        setTopBarMode(
          (existing as any).topBarMode ??
            ((existing as any).topBarImage ? 'image' : 'color'),
        );

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

        // Social links por modo
        setsocialLinksPersonal((existing as any).socialLinksPersonal ?? {});
        setsocialLinksProfessional(
          (existing as any).socialLinksProfessional ?? {},
        );

        // Gallery por modo
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

        // Affiliations por modo
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

        setIsNewProfile(false);
        setActiveField(null);
      } else {
        setMode('personal');
        setIsNewProfile(true);
        setActiveField('realName');
      }
    } catch {
      // opcional: Alert
    } finally {
      setIsLoading(false);
    }
  }, [route?.params?.uid]);

  // Cada vez que la pantalla gana foco, recargamos el perfil
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const countAff = (aff?: InterestAffiliations) =>
    Object.values(aff ?? {}).reduce(
      (acc, arr) => acc + (Array.isArray(arr) && arr.length > 0 ? 1 : 0),
      0,
    );

  const personalInterestsCount = React.useMemo(
    () => countAff(personalAff),
    [personalAff],
  );
  const professionalInterestsCount = React.useMemo(
    () => countAff(professionalAff),
    [professionalAff],
  );

  const canEditField = (field: Exclude<FieldId, null>) =>
    isNewProfile || activeField === field;

  const isEditingAny =
    isNewProfile || activeField !== null || showTopBarControls;

  const interestsCount =
    (mode ?? 'personal') === 'professional'
      ? professionalInterestsCount
      : personalInterestsCount;

  const currentLinks =
    (mode ?? 'personal') === 'professional'
      ? socialLinksProfessional
      : socialLinksPersonal;

  const socialCount = React.useMemo(
    () =>
      Object.values(currentLinks || {}).reduce(
        (acc, v) => acc + (typeof v === 'string' && v.trim() ? 1 : 0),
        0,
      ),
    [currentLinks, mode],
  );

  const photosCount =
    (mode ?? 'personal') === 'professional'
      ? professionalGallery.length
      : personalGallery.length;

  const affiliationsCount =
    (mode ?? 'personal') === 'professional'
      ? professionalAffiliations.length
      : personalAffiliations.length;

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission required',
          'Permission to access photos is required.',
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
      Alert.alert('Error', 'Could not pick image.');
    }
  };

  const takeProfilePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission required',
          'Permission to use the camera is required.',
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
      Alert.alert('Error', 'Could not open camera.');
    }
  };

  const openProfileImageOptions = () => {
    Alert.alert(
      'Profile photo',
      'Choose how you want to add your profile photo.',
      [
        { text: 'Take photo', onPress: takeProfilePhoto },
        { text: 'Choose from library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const pickTopBarImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'We need access to your photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets.length > 0) {
        setTopBarImage(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Could not pick the header image.');
    }
  };

  const handleToggleMode = async () => {
    const nextMode: 'personal' | 'professional' =
      (mode ?? 'personal') === 'personal' ? 'professional' : 'personal';

    setMode(nextMode);

    try {
      const uid = getUid();
      if (!uid) return;
      await updateUserMode(uid, nextMode);
    } catch (e) {
      if (__DEV__) {
        console.error('[CompleteProfile] Error updating mode', e);
      }
    }
  };

  const handleSave = async () => {
    await handleContinue();

    if (!isNewProfile) {
      setActiveField(null);
      setShowTopBarControls(false);
    }
  };

  const validateModerationFields = () => {
    const fieldsToCheck = [
      { label: 'Name', value: realName },
      { label: 'Occupation', value: occupation },
      { label: 'Status', value: status },
      { label: 'Biography', value: bio },
      { label: 'Company', value: company },
    ];

    const offendingField = fieldsToCheck.find(
      (f) => !!f.value?.trim() && containsObjectionableContent(f.value),
    );

    if (offendingField) {
      Alert.alert(
        'Content not allowed',
        `${offendingField.label} contains language that is not allowed. Please remove inappropriate or offensive content.`,
      );
      return false;
    }

    return true;
  };

  const isLocalUri = (value?: string | null) =>
    !!value && /^(file|content|ph|assets-library):/i.test(value);

  const handleContinue = async () => {
    try {
      if (!realName.trim()) {
        Alert.alert('Validation', 'Real name is required.');
        return;
      }
      if (!mode) {
        Alert.alert('Validation', 'Please select a mode.');
        return;
      }

      if (!profileImage) {
        Alert.alert('Validation', 'Profile photo is required.');
        return;
      }

      if (!validateModerationFields()) {
        return;
      }

      setIsLoading(true);
      const uid = getUid();
      if (!uid) throw new Error('User not authenticated.');

      // subir imagen de header si es local
      let uploadedTopBarUrl: string | null = null;
      if (isLocalUri(topBarImage)) {
        uploadedTopBarUrl = await uploadTopBarImage(uid, topBarImage!);
      } else {
        uploadedTopBarUrl = topBarImage ?? null;
      }

      // subir imagen de perfil si es local
      let uploadedImageUrl: string | null = null;
      if (isLocalUri(profileImage)) {
        uploadedImageUrl = await uploadProfileImage(uid, profileImage!);
      } else {
        uploadedImageUrl = profileImage ?? null;
      }

      const payload = {
        realName,
        bio,
        status,
        mode,
        occupation,
        company: mode === 'professional' ? company : '',
        profileImage: uploadedImageUrl,
        topBarColor,
        topBarImage: uploadedTopBarUrl,
        topBarMode,
        profileSetupCompleted: true,
        visibility: true,
      };

      await saveCompleteProfile(uid, payload);

      setIsNewProfile(false);
      setActiveField(null);
      setShowTopBarControls(false);
      setGuideDismissed(true);

      navigation.replace('MainTabs');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const goToProfileExtraScreen = (
    screen: 'Interests' | 'Gallery' | 'Affiliations' | 'SocialMedia',
  ) => {
    const uid = getUid();
    if (!uid) return;

    const params = {
      uid,
      mode: mode ?? 'personal',
      personalAff,
      professionalAff,
    };

    const currentRouteNames = navigation.getState?.()?.routeNames ?? [];

    if (currentRouteNames.includes(screen)) {
      navigation.navigate(screen, params);
      return;
    }

    navigation.getParent?.()?.navigate('Profile', {
      screen,
      params,
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

  const nonPasswordInputProps = {
    secureTextEntry: false,
    autoComplete: 'off' as const,
    textContentType: 'oneTimeCode' as const,
    importantForAutofill: 'no' as const,
    keyboardType: 'default' as const,
  };

  const profileGuideVisible = isNewProfile && !isLoading && !guideDismissed;

  const unloadGuideAudio = useCallback(async () => {
    const sound = guideSoundRef.current;
    guideSoundRef.current = null;
    if (!sound) return;
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    if (!profileGuideVisible || Platform.OS !== 'ios') {
      void unloadGuideAudio();
      return;
    }

    const source = COMPLETE_PROFILE_GUIDE_AUDIO[guideStep];
    if (!source) {
      void unloadGuideAudio();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (!guideAudioModeReadyRef.current) {
          await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
          guideAudioModeReadyRef.current = true;
        }

        await unloadGuideAudio();
        if (cancelled) return;

        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: true,
          isLooping: false,
        });

        if (cancelled) {
          await sound.unloadAsync();
          return;
        }

        guideSoundRef.current = sound;
      } catch {
        // non-blocking
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [guideStep, profileGuideVisible, unloadGuideAudio]);

  useEffect(() => {
    return () => {
      void unloadGuideAudio();
    };
  }, [unloadGuideAudio]);

  const setGuideFieldRef =
    (step: number) =>
    (ref: View | null): void => {
      guideFieldRefs.current[step] = ref;
    };

  useEffect(() => {
    if (!profileGuideVisible) return;

    const inputRefs: Record<number, React.RefObject<RNTextInput | null>> = {
      3: realNameInputRef,
      4: occupationInputRef,
      5: statusInputRef,
      6: bioInputRef,
    };

    const centerStep = () => {
      const target = guideFieldRefs.current[guideStep];

      if (!target || !scrollRef.current) return;

      target.measureLayout(
        scrollRef.current as any,
        (_x, y, _width, height) => {
          const guideCardReservedHeight = 190;
          const bottomReservedHeight =
            guideStep >= 3 && guideStep <= 6
              ? 320
              : guideStep >= 8 && guideStep <= 11
                ? 120
                : 80;

          const availableHeight =
            760 - guideCardReservedHeight - bottomReservedHeight;

          const centeredY =
            y - guideCardReservedHeight - availableHeight / 2 + height / 2;

          const finalY = Math.max(centeredY - 20, 0);

          scrollRef.current?.scrollTo({
            y: finalY,
            animated: true,
          });
        },
        () => {},
      );
    };

    const firstScroll = setTimeout(centerStep, 120);

    const focusTimeout = setTimeout(() => {
      inputRefs[guideStep]?.current?.focus();
    }, 320);

    const secondScroll = setTimeout(centerStep, 750);

    const thirdScroll = setTimeout(centerStep, 1050);

    return () => {
      clearTimeout(firstScroll);
      clearTimeout(focusTimeout);
      clearTimeout(secondScroll);
      clearTimeout(thirdScroll);
    };
  }, [guideStep, profileGuideVisible]);

  const isProfileGuideActive = (step: number) =>
    profileGuideVisible && guideStep === step;

  const goNextGuideStep = () => {
    setGuideStep((prev) => {
      if (prev === 0) {
        setShowTopBarControls(true);
      }

      return Math.min(prev + 1, COMPLETE_PROFILE_GUIDE_STEPS.length - 1);
    });
  };

  const goBackGuideStep = () => {
    setGuideStep((prev) => Math.max(prev - 1, 0));
  };

  const skipProfileGuide = () => {
    setGuideDismissed(true);
    setGuideStep(0);
  };

  const guideAllows = (step: number) =>
    !profileGuideVisible || guideStep === step;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: profileGuideVisible ? 150 : 0,
            paddingBottom: profileGuideVisible ? 110 : isEditingAny ? 110 : 40,
          }}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
        >
          <TopHeader
            topBarMode={topBarMode}
            topBarColor={topBarColor}
            topBarImage={topBarImage}
            profileImage={profileImage}
            onLeftPress={() => navigation.goBack()}
            showAvatar
          />

          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <View
              ref={setGuideFieldRef(0)}
              style={[
                styles.profileHeaderRow,
                profileGuideVisible &&
                  !isProfileGuideActive(0) &&
                  styles.guideInactiveField,
                isProfileGuideActive(0) && styles.guideActiveField,
              ]}
            >
              <View style={styles.profileHeaderInner}>
                <Text style={styles.title}>Your Profile</Text>
                <TouchableOpacity
                  style={[
                    styles.profileCameraBtn,
                    showTopBarControls && styles.profileCameraBtnActive,
                  ]}
                  onPress={() => {
                    if (!guideAllows(0)) return;
                    setShowTopBarControls(true);
                    setGuideStep(1);
                  }}
                  disabled={!guideAllows(0)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={showTopBarControls ? 'close' : 'camera'}
                    size={18}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {showTopBarControls && (
              <View style={styles.topBarControls}>
                <Text style={styles.topBarSectionTitle}>Profile visuals</Text>

                <View
                  ref={setGuideFieldRef(1)}
                  style={[
                    isProfileGuideActive(1) && styles.guideActiveField,
                    profileGuideVisible &&
                      !isProfileGuideActive(1) &&
                      styles.guideInactiveField,
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      if (!guideAllows(1)) return;
                      openProfileImageOptions();
                    }}
                    style={styles.inlinePhotoBtn}
                    activeOpacity={0.85}
                    disabled={!guideAllows(1)}
                  >
                    <Ionicons name="camera" size={16} color="#fff" />
                    <Text style={styles.inlinePhotoText}>
                      Change profile photo
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  ref={setGuideFieldRef(2)}
                  style={[
                    styles.topBarModeRow,
                    isProfileGuideActive(2) && styles.guideActiveField,
                    profileGuideVisible &&
                      !isProfileGuideActive(2) &&
                      styles.guideInactiveField,
                  ]}
                >
                  <Text style={styles.topBarLabel}>Top bar style</Text>

                  <View style={styles.topBarSwitchRow}>
                    <Text style={styles.topBarSwitchText}>Color</Text>
                    <Switch
                      value={topBarMode === 'image'}
                      onValueChange={(value) => {
                        if (!guideAllows(2)) return;
                        setTopBarMode(value ? 'image' : 'color');
                      }}
                      disabled={!guideAllows(2)}
                      trackColor={{ false: '#CBD5F5', true: '#CBD5F5' }}
                      thumbColor="#3B5A85"
                    />
                    <Text style={styles.topBarSwitchText}>Image</Text>
                  </View>
                </View>

                {topBarMode === 'color' ? (
                  <TouchableOpacity
                    style={styles.topBarActionBtn}
                    onPress={() => {
                      if (!guideAllows(2)) return;
                      setPickerOpen(true);
                    }}
                    activeOpacity={0.85}
                    disabled={!guideAllows(2)}
                  >
                    <Ionicons name="color-palette" size={16} color="#1F2937" />
                    <Text style={styles.topBarActionText}>
                      Pick top bar color
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.topBarActionBtn}
                    onPress={() => {
                      if (!guideAllows(2)) return;
                      pickTopBarImage();
                    }}
                    onLongPress={() => {
                      if (!guideAllows(2)) return;
                      setTopBarImage(null);
                    }}
                    activeOpacity={0.85}
                    disabled={!guideAllows(2)}
                  >
                    <Ionicons name="image" size={16} color="#1F2937" />
                    <Text style={styles.topBarActionText}>
                      Pick header image
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Name */}
            <View
              ref={setGuideFieldRef(3)}
              style={[
                styles.fieldGroup,
                profileGuideVisible &&
                  !isProfileGuideActive(3) &&
                  styles.guideInactiveField,
                isProfileGuideActive(3) && styles.guideActiveField,
              ]}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Name</Text>
                <TouchableOpacity
                  onPress={() => setActiveField('realName')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={canEditField('realName') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                key="real-name-input"
                style={[
                  styles.input,
                  canEditField('realName') && styles.inputEditing,
                ]}
                placeholder="Real Name"
                placeholderTextColor="#9CA3AF"
                value={realName}
                onChangeText={setRealName}
                editable={canEditField('realName') && guideAllows(3)}
                maxLength={NAME_MAX}
                ref={realNameInputRef}
                autoCapitalize="words"
                autoCorrect={false}
                {...nonPasswordInputProps}
              />
            </View>

            {/* Occupation */}
            <View
              ref={setGuideFieldRef(4)}
              style={[
                styles.fieldGroup,
                profileGuideVisible &&
                  !isProfileGuideActive(4) &&
                  styles.guideInactiveField,
                isProfileGuideActive(4) && styles.guideActiveField,
              ]}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Occupation</Text>
                <TouchableOpacity
                  onPress={() => setActiveField('occupation')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={canEditField('occupation') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                key="occupation-input"
                style={[
                  styles.input,
                  canEditField('occupation') && styles.inputEditing,
                ]}
                placeholder="Occupation"
                placeholderTextColor="#9CA3AF"
                ref={occupationInputRef}
                value={occupation}
                onChangeText={setOccupation}
                editable={canEditField('occupation') && guideAllows(4)}
                maxLength={OCCUPATION_MAX}
                autoCapitalize="words"
                autoCorrect={false}
                {...nonPasswordInputProps}
              />
            </View>

            {/* Status */}
            <View
              ref={setGuideFieldRef(5)}
              style={[
                styles.fieldGroup,
                profileGuideVisible &&
                  !isProfileGuideActive(5) &&
                  styles.guideInactiveField,
                isProfileGuideActive(5) && styles.guideActiveField,
              ]}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Status</Text>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Text style={styles.charCounter}>
                    {status.length}/{STATUS_MAX}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveField('status')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="pencil"
                      size={16}
                      color={canEditField('status') ? '#3B5A85' : '#9CA3AF'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                key="status-input"
                style={[
                  styles.input,
                  canEditField('status') && styles.inputEditing,
                ]}
                placeholder="Short status (e.g. '🇺🇸 Open to meet new people')"
                placeholderTextColor="#9CA3AF"
                ref={statusInputRef}
                value={status}
                onChangeText={setStatus}
                editable={canEditField('status') && guideAllows(5)}
                maxLength={STATUS_MAX}
                autoCapitalize="sentences"
                autoCorrect={true}
                {...nonPasswordInputProps}
              />
            </View>

            {/* Biography */}
            <View
              ref={setGuideFieldRef(6)}
              style={[
                styles.fieldGroup,
                profileGuideVisible &&
                  !isProfileGuideActive(6) &&
                  styles.guideInactiveField,
                isProfileGuideActive(6) && styles.guideActiveField,
              ]}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Biography</Text>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Text style={styles.charCounter}>
                    {bio.length}/{BIO_MAX}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveField('bio')}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="pencil"
                      size={16}
                      color={canEditField('bio') ? '#3B5A85' : '#9CA3AF'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                key="bio-input"
                style={[
                  styles.input,
                  styles.textArea,
                  canEditField('bio') && styles.inputEditing,
                ]}
                placeholder="Short Biography (e.g. '🇺🇸 From USA · Likes coffee · Marketing · Study ...')"
                placeholderTextColor="#9CA3AF"
                ref={bioInputRef}
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                editable={canEditField('bio') && guideAllows(6)}
                maxLength={BIO_MAX}
                autoCapitalize="sentences"
                autoCorrect={true}
                {...nonPasswordInputProps}
              />
            </View>

            {/* Switch de modo */}
            <View
              ref={setGuideFieldRef(7)}
              style={[
                styles.switchWrap,
                profileGuideVisible &&
                  !isProfileGuideActive(7) &&
                  styles.guideInactiveField,
                isProfileGuideActive(7) && styles.guideActiveField,
              ]}
            >
              <ModeSwitch
                mode={(mode || 'personal') as 'personal' | 'professional'}
                topBarColor={'#3B5A85'}
                onToggle={() => {
                  if (!guideAllows(7)) return;
                  handleToggleMode();
                }}
                compact={isLargeText}
              />
            </View>

            {/* Campos adicionales (professional) */}
            {mode === 'professional' && (
              <View style={styles.professionalContainer}>
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Company</Text>
                    <TouchableOpacity
                      onPress={() => setActiveField('company')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="pencil"
                        size={16}
                        color={canEditField('company') ? '#3B5A85' : '#9CA3AF'}
                      />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    key="company-input"
                    style={[
                      styles.input,
                      canEditField('company') && styles.inputEditing,
                    ]}
                    placeholder="Company"
                    placeholderTextColor="#9CA3AF"
                    value={company}
                    onChangeText={setCompany}
                    editable={canEditField('company')}
                    maxLength={COMPANY_MAX}
                    autoCapitalize="words"
                    autoCorrect={false}
                    {...nonPasswordInputProps}
                  />
                </View>
              </View>
            )}

            {/* Quick Actions */}
            <View>
              <ProfileQuickActions
                stats={{
                  interestsCount,
                  socialCount,
                  photosCount,
                  affiliationsCount,
                }}
                affiliationsRef={setGuideFieldRef(8)}
                interestsRef={setGuideFieldRef(9)}
                socialRef={setGuideFieldRef(10)}
                galleryRef={setGuideFieldRef(11)}
                affiliationsGuideHighlight={isProfileGuideActive(8)}
                interestsGuideHighlight={isProfileGuideActive(9)}
                socialGuideHighlight={isProfileGuideActive(10)}
                galleryGuideHighlight={isProfileGuideActive(11)}
                affiliationsGuideDimmed={
                  profileGuideVisible && !isProfileGuideActive(8)
                }
                interestsGuideDimmed={
                  profileGuideVisible && !isProfileGuideActive(9)
                }
                socialGuideDimmed={
                  profileGuideVisible && !isProfileGuideActive(10)
                }
                galleryGuideDimmed={
                  profileGuideVisible && !isProfileGuideActive(11)
                }
                onOpenInterests={() => {
                  if (!guideAllows(9)) return;
                  goToProfileExtraScreen('Interests');
                }}
                onOpenSocial={() => {
                  if (!guideAllows(10)) return;
                  goToSocialMedia();
                }}
                onOpenGallery={() => {
                  if (!guideAllows(11)) return;
                  goToProfileExtraScreen('Gallery');
                }}
                onOpenAffiliations={() => {
                  if (!guideAllows(8)) return;
                  goToProfileExtraScreen('Affiliations');
                }}
                compact={isLargeText}
              />
            </View>
          </View>

          {isLoading && (
            <View style={styles.loadingOverlay} pointerEvents="auto">
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2B3A42" />
                <Text style={styles.loadingText}>Saving your profile...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {isEditingAny && (
          <View
            onLayout={(event) => {
              guideYPositions.current[12] = event.nativeEvent.layout.y;
            }}
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.bottomSaveBtn,
                isLoading && { opacity: 0.7 },
                isProfileGuideActive(12) && styles.guideActiveButton,
              ]}
              onPress={handleSave}
              disabled={isLoading || !guideAllows(12)}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.bottomSaveText}>Save changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
      {profileGuideVisible && (
        <Animated.View
          entering={FadeInDown.duration(350)}
          style={[styles.floatingGuideCard, { top: insets.top + 10 }]}
        >
          <View style={styles.guideHeader}>
            <View style={styles.guideBadge}>
              <Text style={styles.guideBadgeText}>
                {guideStep + 1}/{COMPLETE_PROFILE_GUIDE_STEPS.length}
              </Text>
            </View>

            <TouchableOpacity onPress={skipProfileGuide}>
              <Text style={styles.guideSkip}>Skip guide</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.guideTitle}>
            {COMPLETE_PROFILE_GUIDE_STEPS[guideStep].title}
          </Text>

          <Text style={styles.guideDescription}>
            {COMPLETE_PROFILE_GUIDE_STEPS[guideStep].description}
          </Text>

          <View style={styles.guideActionsRow}>
            <TouchableOpacity
              style={[
                styles.guideNavButton,
                guideStep === 0 && styles.guideNavButtonDisabled,
              ]}
              onPress={goBackGuideStep}
              disabled={guideStep === 0}
              activeOpacity={0.85}
            >
              <Text style={styles.guideNavButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.guideNavButtonPrimary}
              onPress={
                guideStep === COMPLETE_PROFILE_GUIDE_STEPS.length - 1
                  ? skipProfileGuide
                  : goNextGuideStep
              }
              activeOpacity={0.85}
            >
              <Text style={styles.guideNavButtonPrimaryText}>
                {guideStep === COMPLETE_PROFILE_GUIDE_STEPS.length - 1
                  ? 'Got it'
                  : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
      <ColorPickerModal
        visible={pickerOpen}
        initialColor={topBarColor}
        onClose={() => setPickerOpen(false)}
        onSelect={(color) => {
          setTopBarColor(color);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  floatingControlsWrap: {
    position: 'absolute',
    right: 8,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modePillWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(243,244,246,0.95)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  modePillOpt: { paddingHorizontal: 8, paddingVertical: 4 },
  modePillOptActive: { backgroundColor: '#3B5A85' },
  modePillText: { color: '#374151', fontWeight: '600' },
  modePillTextActive: { color: '#fff' },
  headerTinyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(58,89,133,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginTop: 30,
    marginBottom: 16,
  },

  profileHeaderRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 12,
  },
  profileHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileCameraBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B5A85',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCameraBtnActive: {
    backgroundColor: '#EF4444',
  },

  topBarControls: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  topBarSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  inlinePhotoBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#3B5A85',
    marginBottom: 10,
    gap: 6,
  },
  inlinePhotoText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  topBarModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topBarLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  topBarSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topBarSwitchText: {
    fontSize: 12,
    color: '#4B5563',
  },
  topBarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  topBarActionText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },

  fieldGroup: {
    width: '100%',
    marginBottom: 12,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 2,
  },

  charCounter: {
    fontSize: 12,
    color: '#6B7280',
  },

  input: {
    width: '100%',
    backgroundColor: '#F1F1F1',
    color: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },

  inputEditing: {
    borderColor: '#3B5A85',
    backgroundColor: '#EEF2FF',
  },

  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },

  professionalContainer: {
    width: '100%',
    marginTop: 10,
  },

  changePhotoBtn: {
    alignSelf: 'center',
    marginTop: 8,
    backgroundColor: '#3B5A85',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changePhotoText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  loadingText: { marginTop: 10, fontSize: 16, color: '#2B3A42' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 12,
  },
  colorSwatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  closeBtn: {
    backgroundColor: '#2B3A42',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  switchWrap: {
    alignItems: 'center',
    marginVertical: 8,
    width: '100%',
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
  floatingGuideCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 50,
    backgroundColor: '#EEF4FA',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ADCBE3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  guideBadge: {
    backgroundColor: '#3B5A85',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  guideBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  guideSkip: {
    color: '#3B5A85',
    fontSize: 12,
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
  guideActiveField: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    borderWidth: 2,
    borderColor: '#3B5A85',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  guideInactiveField: {
    opacity: 0.45,
  },
  guideActiveButton: {
    borderWidth: 2,
    borderColor: '#ADCBE3',
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
  guideNavButtonDisabled: {
    opacity: 0.45,
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
