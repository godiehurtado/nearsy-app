// src/screens/AffiliationsScreen.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useGuideAudio } from '../hooks/useGuideAudio';

import TopHeader from '../components/TopHeader';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { getUserProfile } from '../services/firestoreService';
import { uploadAffiliationImage } from '../services/storageService';

type TopBarMode = 'color' | 'image';
type ProfileMode = 'personal' | 'professional';

import type { AffiliationItem, AffiliationCategory } from '../types/profile';

type Props = {
  navigation: any;
  route: {
    params?: {
      uid?: string;
      mode?: ProfileMode;
    };
  };
};

const LABEL_MAX = 50;

// 🔹 CONFIG categorías
const CATEGORY_CONFIG: {
  key: AffiliationCategory;
  title: string;
  subtitle: string;
  emoji: string;
}[] = [
  {
    key: 'schoolCollege',
    title: 'School / College',
    subtitle: 'Your school, college or university.',
    emoji: '🎓',
  },
  {
    key: 'majorField',
    title: 'Major / Field',
    subtitle: 'Your main field of study or specialization.',
    emoji: '📚',
  },
  {
    key: 'alumniGroup',
    title: 'Alumni Group',
    subtitle: 'Alumni associations or class groups you belong to.',
    emoji: '🏫',
  },
  {
    key: 'favoriteTeam',
    title: 'Favorite Sport Team',
    subtitle: 'Club, national team or franchise you support.',
    emoji: '⚽',
  },
  {
    key: 'hobbiesClubs',
    title: 'Clubs',
    subtitle: 'Hobby clubs, art groups or special interests.',
    emoji: '🎭',
  },
  {
    key: 'industry',
    title: 'Industry',
    subtitle: 'The main industry you work or network in.',
    emoji: '💼',
  },
  {
    key: 'communityGroups',
    title: 'Community Groups',
    subtitle: 'Community, volunteering or local groups.',
    emoji: '🧑‍🤝‍🧑',
  },
  {
    key: 'pets',
    title: 'Pets',
    subtitle: 'Your pets or animals you feel connected to.',
    emoji: '🐶',
  },
];

const AFFILIATIONS_ONBOARDING_STEPS = [
  {
    title: 'School / College',
    description: 'Tap Add to enter your school or college.',
  },
  {
    title: 'Name your school',
    description: 'Type your school or college name.',
  },
  {
    title: 'Add an image (optional)',
    description: 'You can add a logo or photo if you want.',
  },
  {
    title: 'Save this affiliation',
    description: 'Tap Save to add it to your profile.',
  },
  {
    title: 'Other categories',
    description:
      'You can repeat this same process for all other affiliations.',
  },
];

const AFFILIATIONS_GUIDE_AUDIO: number[] = [
  require('../assets/audio/Affiliations_EnterCollegeOrSchool.mp3'),
  require('../assets/audio/Affiliations_TypeYourSchoolName.mp3'),
  require('../assets/audio/Affiliations_IfDesiredAddAnImage.mp3'),
  require('../assets/audio/Affiliations_TapToSave.mp3'),
  require('../assets/audio/Affiliations_FollowTheSameProcess.mp3'),
];

function GuideHighlightSlot({
  highlight,
  dimmed,
  style,
  children,
}: {
  highlight?: boolean;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
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

export default function AffiliationsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();

  const [isSetupMode, setIsSetupMode] = useState(false);

  const [mode, setMode] = useState<ProfileMode>('personal');

  // Header visuals
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [topBarMode, setTopBarMode] = useState<TopBarMode>('color');

  // Affiliations
  const [affiliations, setAffiliations] = useState<AffiliationItem[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modal label + logo
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<AffiliationCategory | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [tempLabel, setTempLabel] = useState('');
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);

  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const labelInputRef = useRef<TextInput>(null);

  // Helpers para agrupar
  const getItemsForCategory = (cat: AffiliationCategory) =>
    affiliations
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.category === cat);

  const getAffiliationsFieldName = () =>
    mode === 'professional'
      ? 'professionalAffiliations'
      : 'personalAffiliations';

  // Cargar perfil + afiliaciones existentes
  useEffect(() => {
    const initialMode: ProfileMode =
      route?.params?.mode === 'professional' ? 'professional' : 'personal';
    setMode(initialMode);

    (async () => {
      const uid = route?.params?.uid || firebaseAuth.currentUser?.uid;
      if (!uid) return;

      try {
        setIsLoading(true);
        const existing = await getUserProfile(uid);

        if (!existing) {
          // 🔥 SETUP MODE
          setIsSetupMode(true);

          // defaults seguros
          setProfileImage(null);
          setTopBarColor('#3B5A85');
          setTopBarImage(null);
          setTopBarMode('color');
          setAffiliations([]);

          return;
        }

        setIsSetupMode(existing.profileSetupCompleted !== true);

        setProfileImage(existing.profileImage ?? null);
        setTopBarColor(existing.topBarColor ?? '#3B5A85');
        setTopBarImage((existing as any).topBarImage ?? null);
        setTopBarMode(
          (existing as any).topBarMode ??
            ((existing as any).topBarImage ? 'image' : 'color'),
        );

        const sourceField =
          initialMode === 'professional'
            ? (existing as any).professionalAffiliations
            : (existing as any).personalAffiliations;

        if (Array.isArray(sourceField)) {
          setAffiliations(
            sourceField.map((a: any) => ({
              category: a.category as AffiliationCategory,
              label: a.label ?? '',
              imageUrl: a.imageUrl ?? null,
            })),
          );
        }
      } catch (e) {
        if (__DEV__) {
          console.error('[Affiliations] Error loading affiliations', e);
        }
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onboardingActive =
    isSetupMode &&
    Platform.OS === 'ios' &&
    !onboardingCompleted &&
    !isLoading;

  const { unload: unloadOnboardingAudio } = useGuideAudio(
    onboardingActive,
    AFFILIATIONS_GUIDE_AUDIO[onboardingStep],
  );

  const completeOnboarding = useCallback(() => {
    setOnboardingCompleted(true);
    void unloadOnboardingAudio();
  }, [unloadOnboardingAudio]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep !== 1 || !labelModalOpen) return;

    const focusTimer = setTimeout(() => {
      labelInputRef.current?.focus();
    }, 320);

    return () => clearTimeout(focusTimer);
  }, [onboardingActive, onboardingStep, labelModalOpen]);

  const goNextOnboardingStep = () => {
    if (onboardingStep === 1) {
      if (!tempLabel.trim()) {
        Alert.alert(
          'One more thing',
          'Please enter a school, college, or university name.',
        );
        return;
      }
      setOnboardingStep(2);
      return;
    }

    if (onboardingStep === 2) {
      setOnboardingStep(3);
    }
  };

  const goBackOnboardingStep = () => {
    if (onboardingStep === 1) {
      setOnboardingStep(0);
      setLabelModalOpen(false);
      return;
    }

    if (onboardingStep === 2) {
      setOnboardingStep(1);
      return;
    }

    if (onboardingStep === 3) {
      setOnboardingStep(2);
    }
  };

  const openEditorForCategory = (
    cat: AffiliationCategory,
    globalIndex?: number,
  ) => {
    if (
      onboardingActive &&
      onboardingStep < 4 &&
      cat !== 'schoolCollege'
    ) {
      return;
    }

    const isEditingExisting = typeof globalIndex === 'number';

    let existingLabel = '';
    let existingImage = null;

    if (isEditingExisting && typeof globalIndex === 'number') {
      existingLabel = affiliations[globalIndex]?.label ?? '';
      existingImage = affiliations[globalIndex]?.imageUrl ?? null;
    }

    setEditingCategory(cat);
    setEditingItemIndex(isEditingExisting ? globalIndex! : null);
    setTempLabel(existingLabel);
    setTempImageUrl(existingImage);
    setLabelModalOpen(true);

    if (
      onboardingActive &&
      onboardingStep === 0 &&
      cat === 'schoolCollege' &&
      !isEditingExisting
    ) {
      setOnboardingStep(1);
    }
  };

  const handleSaveLabel = () => {
    if (!editingCategory) return;

    const trimmed = tempLabel.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Please enter a short label.');
      return;
    }

    const exists = affiliations.some(
      (a, idx) =>
        idx !== editingItemIndex &&
        a.category === editingCategory &&
        a.label.toLowerCase() === trimmed.toLowerCase(),
    );

    if (exists) {
      Alert.alert('Duplicate', 'This item already exists.');
      return;
    }

    const savedCategory = editingCategory;

    setAffiliations((prev) => {
      const next = [...prev];

      if (editingItemIndex != null && next[editingItemIndex]) {
        // actualizar existente
        next[editingItemIndex] = {
          ...next[editingItemIndex],
          label: trimmed,
          imageUrl: tempImageUrl,
        };
      } else {
        // agregar nuevo
        next.push({
          category: editingCategory,
          label: trimmed,
          imageUrl: tempImageUrl,
        });
      }

      return next;
    });

    setLabelModalOpen(false);
    setEditingCategory(null);
    setEditingItemIndex(null);
    setTempLabel('');
    setTempImageUrl(null);

    if (
      onboardingActive &&
      savedCategory === 'schoolCollege' &&
      onboardingStep >= 3
    ) {
      setOnboardingStep(4);
    }
  };

  const handleDeleteAffiliation = async (index: number) => {
    const item = affiliations[index];
    if (!item) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Delete affiliation',
        `Are you sure you want to delete "${item.label}"?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
      );
    });

    if (!confirmed) return;

    try {
      setIsSaving(true);

      const uid = route?.params?.uid || firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      const next = affiliations.filter((_, idx) => idx !== index);

      await setDoc(
        doc(firestoreDb, 'users', uid),
        {
          [getAffiliationsFieldName()]: next,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      setAffiliations(next);
    } catch (e: any) {
      if (__DEV__) {
        console.error('[Affiliations] Error deleting affiliation', e);
      }
      Alert.alert('Error', e?.message || 'Could not delete affiliation.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);

      const uid = route?.params?.uid || firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      const withUploaded = await Promise.all(
        affiliations.map(async (item) => {
          const uri = item.imageUrl ?? '';

          const isLocal =
            !!uri &&
            (uri.startsWith('file:') ||
              uri.startsWith('content:') ||
              uri.startsWith('ph:'));

          if (isLocal) {
            try {
              const remoteUrl = await uploadAffiliationImage(
                uid,
                uri,
                item.category,
              );
              return { ...item, imageUrl: remoteUrl };
            } catch (e) {
              if (__DEV__)
                console.error('Error uploading affiliation image', e);
              return item;
            }
          }

          return item;
        }),
      );

      const fieldName = getAffiliationsFieldName();

      // 🔥 CLAVE: setDoc con merge
      await setDoc(
        doc(firestoreDb, 'users', uid),
        {
          [fieldName]: withUploaded,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      setAffiliations(withUploaded);

      Alert.alert('Success', 'Affiliations saved.');
      navigation.goBack();
    } catch (e: any) {
      if (__DEV__) {
        console.error('[Affiliations] Error saving affiliations', e);
      }
      Alert.alert('Error', e?.message || 'Could not save affiliations.');
    } finally {
      setIsSaving(false);
    }
  };

  const showOnboardingGuideOutside =
    onboardingActive && (onboardingStep === 0 || onboardingStep === 4);

  const showOnboardingGuideInModal =
    onboardingActive &&
    onboardingStep >= 1 &&
    onboardingStep <= 3 &&
    labelModalOpen;

  const onboardingGuideCardBody = (
    <>
      <View style={styles.guideHeader}>
        <View style={styles.guideBadge}>
          <Text style={styles.guideBadgeText}>
            {onboardingStep + 1}/{AFFILIATIONS_ONBOARDING_STEPS.length}
          </Text>
        </View>

        <TouchableOpacity onPress={completeOnboarding}>
          <Text style={styles.guideSkip}>Skip guide</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.guideTitle}>
        {AFFILIATIONS_ONBOARDING_STEPS[onboardingStep].title}
      </Text>

      <Text style={styles.guideDescription}>
        {AFFILIATIONS_ONBOARDING_STEPS[onboardingStep].description}
      </Text>

      {onboardingStep >= 1 && onboardingStep <= 2 ? (
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

      {onboardingStep === 3 ? (
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

      {onboardingStep === 4 ? (
        <TouchableOpacity
          style={styles.guideGotItBtn}
          onPress={completeOnboarding}
          activeOpacity={0.85}
        >
          <Text style={styles.guideGotItText}>Got it</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <TopHeader
        topBarMode={topBarMode}
        topBarColor={topBarColor}
        topBarImage={topBarImage}
        profileImage={profileImage}
        leftIcon="chevron-back"
        onLeftPress={() => navigation.goBack()}
        showAvatar
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 120,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          {mode === 'professional'
            ? 'Professional Affiliations'
            : 'Social Affiliations'}
        </Text>

        <Text style={styles.subtitle}>
          Add logos or images to show more about your story.
        </Text>

        {isLoading ? (
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3B5A85" />
          </View>
        ) : (
          CATEGORY_CONFIG.map((cat) => {
            const itemsForCat = getItemsForCategory(cat.key);

            const blockDimmed =
              onboardingActive &&
              onboardingStep < 4 &&
              cat.key !== 'schoolCollege';

            return (
              <View
                key={cat.key}
                style={[styles.block, blockDimmed && styles.guideDimmed]}
                pointerEvents={blockDimmed ? 'none' : 'auto'}
              >
                <View style={styles.blockHeader}>
                  <Text style={styles.blockTitle}>
                    {cat.emoji} {cat.title}
                  </Text>
                </View>

                <Text style={styles.blockSubtitle}>{cat.subtitle}</Text>

                <View style={styles.affiliationCardWrap}>
                  <View style={styles.affiliationRow}>
                    {itemsForCat.map(({ item, idx }) => (
                      <TouchableOpacity
                        key={`${cat.key}-${idx}`}
                        style={styles.affiliationCard}
                        onPress={() => openEditorForCategory(cat.key, idx)}
                        onLongPress={() => handleDeleteAffiliation(idx)}
                        activeOpacity={0.9}
                      >
                        <View style={styles.affiliationCircle}>
                          {item.imageUrl ? (
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={styles.affiliationImage}
                            />
                          ) : (
                            <Text style={styles.affiliationEmoji}>
                              {cat.emoji}
                            </Text>
                          )}
                        </View>

                        <Text style={styles.affiliationLabel} numberOfLines={2}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    {cat.key === 'schoolCollege' ? (
                      <GuideHighlightSlot
                        highlight={
                          onboardingActive && onboardingStep === 0
                        }
                        style={styles.affiliationCard}
                      >
                        <TouchableOpacity
                          style={styles.affiliationCardInner}
                          onPress={() => openEditorForCategory(cat.key)}
                          activeOpacity={0.9}
                          disabled={
                            onboardingActive && onboardingStep !== 0
                          }
                        >
                          <View
                            style={[
                              styles.affiliationCircle,
                              {
                                borderStyle: 'dashed',
                                borderColor: '#9CA3AF',
                              },
                            ]}
                          >
                            <Ionicons
                              name="add-outline"
                              size={28}
                              color="#9CA3AF"
                            />
                          </View>

                          <Text
                            style={[
                              styles.affiliationLabel,
                              { color: '#9CA3AF' },
                            ]}
                            numberOfLines={2}
                          >
                            {itemsForCat.length === 0
                              ? 'Add your first item'
                              : 'Add more'}
                          </Text>
                        </TouchableOpacity>
                      </GuideHighlightSlot>
                    ) : (
                      <TouchableOpacity
                        style={styles.affiliationCard}
                        onPress={() => openEditorForCategory(cat.key)}
                        activeOpacity={0.9}
                      >
                        <View
                          style={[
                            styles.affiliationCircle,
                            { borderStyle: 'dashed', borderColor: '#9CA3AF' },
                          ]}
                        >
                          <Ionicons
                            name="add-outline"
                            size={28}
                            color="#9CA3AF"
                          />
                        </View>

                        <Text
                          style={[
                            styles.affiliationLabel,
                            { color: '#9CA3AF' },
                          ]}
                          numberOfLines={2}
                        >
                          {itemsForCat.length === 0
                            ? 'Add your first item'
                            : 'Add more'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal para label + preview */}
      <Modal
        visible={labelModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setLabelModalOpen(false);
          if (onboardingActive && onboardingStep < 4) {
            setOnboardingStep(0);
          }
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setLabelModalOpen(false);
              if (onboardingActive && onboardingStep < 4) {
                setOnboardingStep(0);
              }
            }}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              {showOnboardingGuideInModal ? (
                <Animated.View
                  entering={FadeInDown.duration(350)}
                  style={styles.modalGuideCard}
                >
                  {onboardingGuideCardBody}
                </Animated.View>
              ) : null}

              <Text style={styles.modalTitle}>Add affiliation</Text>
              <Text style={styles.modalSubtitle}>
                Give it a name. You can also add an image if you want. (max{' '}
                {LABEL_MAX} characters).
              </Text>

              <View style={styles.modalPreviewCircle}>
                {tempImageUrl ? (
                  <Image
                    source={{ uri: tempImageUrl }}
                    style={styles.affiliationImage}
                  />
                ) : (
                  <Ionicons name="image-outline" size={32} color="#9CA3AF" />
                )}
              </View>
              <GuideHighlightSlot
                highlight={onboardingActive && onboardingStep === 2}
                dimmed={onboardingActive && onboardingStep !== 2}
              >
                <TouchableOpacity
                  style={styles.addImageBtn}
                  onPress={async () => {
                    if (onboardingActive && onboardingStep !== 2) return;
                    try {
                      const perm =
                        await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (!perm.granted) {
                        Alert.alert(
                          'Permission required',
                          'We need access to your photos.',
                        );
                        return;
                      }

                      const result =
                        await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ImagePicker.MediaTypeOptions.Images,
                          allowsEditing: true,
                          aspect: [1, 1],
                          quality: 0.8,
                        });

                      if (!result.canceled && result.assets.length > 0) {
                        setTempImageUrl(result.assets[0].uri);
                      }
                    } catch (e) {
                      Alert.alert('Error', 'Could not pick image.');
                    }
                  }}
                  activeOpacity={0.85}
                  disabled={onboardingActive && onboardingStep !== 2}
                >
                  <Ionicons name="image-outline" size={16} color="#3B5A85" />
                  <Text style={styles.addImageText}>
                    {tempImageUrl ? 'Change image' : 'Add image (optional)'}
                  </Text>
                </TouchableOpacity>
              </GuideHighlightSlot>

              <GuideHighlightSlot
                highlight={onboardingActive && onboardingStep === 1}
                dimmed={onboardingActive && onboardingStep !== 1}
                style={styles.modalInputGroup}
              >
                <View style={styles.modalLabelRow}>
                  <Text style={styles.modalLabel}>Label</Text>
                  <Text style={styles.modalCounter}>
                    {tempLabel.length}/{LABEL_MAX}
                  </Text>
                </View>
                <TextInput
                  ref={labelInputRef}
                  style={styles.modalInput}
                  placeholder="E.g. MIT, Lakers, Photography Club..."
                  placeholderTextColor="#9CA3AF"
                  value={tempLabel}
                  editable={!onboardingActive || onboardingStep === 1}
                  onChangeText={(t) =>
                    t.length <= LABEL_MAX ? setTempLabel(t) : null
                  }
                />
              </GuideHighlightSlot>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => {
                    setLabelModalOpen(false);
                    if (onboardingActive && onboardingStep < 4) {
                      setOnboardingStep(0);
                    }
                  }}
                  activeOpacity={0.85}
                  disabled={onboardingActive && onboardingStep >= 1}
                >
                  <Text style={styles.modalBtnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <GuideHighlightSlot
                  highlight={onboardingActive && onboardingStep === 3}
                  dimmed={onboardingActive && onboardingStep < 3}
                >
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary]}
                    onPress={handleSaveLabel}
                    activeOpacity={0.85}
                    disabled={onboardingActive && onboardingStep < 3}
                  >
                    <Text style={styles.modalBtnPrimaryText}>Save</Text>
                  </TouchableOpacity>
                </GuideHighlightSlot>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Barra inferior para guardar */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 },
        ]}
      >
        <TouchableOpacity
          style={[styles.bottomSaveBtn, isSaving && { opacity: 0.7 }]}
          onPress={handleSaveAll}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.bottomSaveText}>Save affiliations</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  block: {
    marginTop: 18,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    paddingRight: 8,
  },
  blockSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B5A85',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 4,
  },
  editPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  affiliationCardWrap: {
    marginTop: 10,
  },
  affiliationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  affiliationCard: {
    alignItems: 'center',
    width: 90,
  },
  affiliationCardInner: {
    alignItems: 'center',
    width: 90,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
  guideGotItBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
    backgroundColor: '#3B5A85',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  guideGotItText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  affiliationCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: '#3B5A85',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  affiliationImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  affiliationEmoji: {
    fontSize: 32,
  },
  affiliationLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 100,
  },
  emptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  modalPreviewCircle: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#3B5A85',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  modalInputGroup: {
    marginBottom: 14,
  },
  modalLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  modalCounter: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    columnGap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  modalBtnGhostText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  modalBtnPrimary: {
    backgroundColor: '#3B5A85',
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Bottom bar
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

  addImageBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },

  addImageText: {
    color: '#3B5A85',
    fontWeight: '600',
    fontSize: 13,
  },
});
