// src/screens/AffiliationsScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import TopHeader from '../components/TopHeader';
import {
  getUserProfile,
  updateUserAffiliations,
} from '../services/firestoreService';
import { uploadAffiliationImage } from '../services/storageService';

type TopBarMode = 'color' | 'image';
type ProfileMode = 'personal' | 'professional';

import type { AffiliationItem, AffiliationCategory } from '../types/profile';

type Props = {
  navigation: any;
  route: {
    params?: {
      mode?: ProfileMode;
    };
  };
};

const LABEL_MAX = 20;
const MAX_PER_CATEGORY = 4;

// 🔹 NUEVA CONFIG para las 10 preguntas
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
    key: 'favoriteSport',
    title: 'Favorite Sport',
    subtitle: 'The sport you enjoy the most.',
    emoji: '🏀',
  },
  {
    key: 'favoriteTeam',
    title: 'Favorite Team',
    subtitle: 'Club, national team or franchise you support.',
    emoji: '⚽',
  },
  {
    key: 'hobbiesClubs',
    title: 'Hobbies / Clubs',
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
    key: 'languages',
    title: 'Languages',
    subtitle: 'Languages you speak or identify with.',
    emoji: '🗺️',
  },
  {
    key: 'pets',
    title: 'Pets',
    subtitle: 'Your pets or animals you feel connected to.',
    emoji: '🐶',
  },
];

export default function AffiliationsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<ProfileMode>('personal');

  // Header visuals
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [topBarMode, setTopBarMode] = useState<TopBarMode>('color');

  // Affiliations (todas las categorías mezcladas)
  const [affiliations, setAffiliations] = useState<AffiliationItem[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Modal para editar label + logo
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<AffiliationCategory | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [tempLabel, setTempLabel] = useState('');
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);

  // Helpers para agrupar
  const getItemsForCategory = (cat: AffiliationCategory) =>
    affiliations
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.category === cat);

  // Cargar perfil + afiliaciones existentes
  useEffect(() => {
    const initialMode: ProfileMode =
      route?.params?.mode === 'professional' ? 'professional' : 'personal';
    setMode(initialMode);

    (async () => {
      const uid = getAuth().currentUser?.uid;
      if (!uid) return;

      try {
        setIsLoading(true);
        const existing = await getUserProfile(uid);
        if (!existing) return;

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
        console.error('Error loading affiliations', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const openEditorForCategory = async (
    cat: AffiliationCategory,
    globalIndex?: number,
  ) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'We need access to your photos.');
        return;
      }

      const itemsForCat = getItemsForCategory(cat);
      const isEditingExisting = typeof globalIndex === 'number';

      // Si es nuevo y ya hay 4 -> no dejar agregar más
      if (!isEditingExisting && itemsForCat.length >= MAX_PER_CATEGORY) {
        Alert.alert(
          'Limit reached',
          `You can add up to ${MAX_PER_CATEGORY} items for this category.`,
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const pickedUri = result.assets[0].uri;

      let existingLabel = '';
      if (isEditingExisting && typeof globalIndex === 'number') {
        existingLabel = affiliations[globalIndex]?.label ?? '';
      }

      setEditingCategory(cat);
      setEditingItemIndex(
        isEditingExisting && typeof globalIndex === 'number'
          ? globalIndex
          : null,
      );
      setTempImageUrl(pickedUri);
      setTempLabel(existingLabel);
      setLabelModalOpen(true);
    } catch (e) {
      console.error('Error picking affiliation image', e);
      Alert.alert('Error', 'Could not pick image.');
    }
  };

  const handleSaveLabel = () => {
    if (!editingCategory) return;

    const trimmed = tempLabel.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Please enter a short label.');
      return;
    }

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
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      // Subir imágenes locales
      const withUploaded = await Promise.all(
        affiliations.map(async (item) => {
          if (item.imageUrl && item.imageUrl.startsWith('file')) {
            try {
              const remoteUrl = await uploadAffiliationImage(
                uid,
                item.imageUrl,
                item.category,
              );
              return { ...item, imageUrl: remoteUrl };
            } catch (e) {
              console.error('Error uploading affiliation image', e);
              return item;
            }
          }
          return item;
        }),
      );

      const fieldName =
        mode === 'professional'
          ? 'professionalAffiliations'
          : 'personalAffiliations';

      await updateUserAffiliations(uid, fieldName, withUploaded);

      setAffiliations(withUploaded);
      Alert.alert('Success', 'Affiliations updated.');
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.message || 'Could not save affiliations.');
    } finally {
      setIsSaving(false);
    }
  };

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
          Add up to {MAX_PER_CATEGORY} logos or images for each category to show
          more about your story.
        </Text>

        {isLoading ? (
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3B5A85" />
          </View>
        ) : (
          CATEGORY_CONFIG.map((cat) => {
            const itemsForCat = getItemsForCategory(cat.key);
            const canAddMore = itemsForCat.length < MAX_PER_CATEGORY;

            return (
              <View key={cat.key} style={styles.block}>
                <View style={styles.blockHeader}>
                  <Text style={styles.blockTitle}>
                    {cat.emoji} {cat.title}
                  </Text>

                  {canAddMore && (
                    <TouchableOpacity
                      style={styles.editPill}
                      onPress={() => openEditorForCategory(cat.key)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="add" size={14} color="#fff" />
                      <Text style={styles.editPillText}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.blockSubtitle}>{cat.subtitle}</Text>

                <View style={styles.affiliationCardWrap}>
                  {itemsForCat.length === 0 ? (
                    <Text style={styles.emptyText}>
                      You can add up to {MAX_PER_CATEGORY} items for this
                      category.
                    </Text>
                  ) : (
                    <View style={styles.affiliationRow}>
                      {itemsForCat.map(({ item, idx }) => (
                        <TouchableOpacity
                          key={`${cat.key}-${idx}`}
                          style={styles.affiliationCard}
                          onPress={
                            () => openEditorForCategory(cat.key, idx) // idx es índice global
                          }
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
                          <Text
                            style={styles.affiliationLabel}
                            numberOfLines={2}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      {canAddMore && (
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
                            Add more
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
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
        onRequestClose={() => setLabelModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLabelModalOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Set your label</Text>
            <Text style={styles.modalSubtitle}>
              Short text for this affiliation (max {LABEL_MAX} characters).
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

            <View style={styles.modalInputGroup}>
              <View style={styles.modalLabelRow}>
                <Text style={styles.modalLabel}>Label</Text>
                <Text style={styles.modalCounter}>
                  {tempLabel.length}/{LABEL_MAX}
                </Text>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="E.g. MIT, Lakers, Photography Club..."
                placeholderTextColor="#9CA3AF"
                value={tempLabel}
                onChangeText={(t) =>
                  t.length <= LABEL_MAX ? setTempLabel(t) : null
                }
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setLabelModalOpen(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleSaveLabel}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
    width: 80,
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
    maxWidth: 90,
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
});
