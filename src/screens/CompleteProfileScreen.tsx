// src/screens/CompleteProfileScreen.tsx
import React, { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';

import ModeSwitch from '../components/ModeSwitch';
import ProfileQuickActions from '../components/ProfileQuickActions';
import TopHeader from '../components/TopHeader';
import ColorPickerModal from '../components/ColorPickerModal';
import {
  InterestAffiliations,
  InterestLabel,
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

export default function CompleteProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

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

  // NUEVO: Social links por modo
  const [socialLinksPersonal, setsocialLinksPersonal] = useState<SocialLinks>(
    {},
  );
  const [socialLinksProfessional, setsocialLinksProfessional] =
    useState<SocialLinks>({});

  // NUEVO: Gallery por modo
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
  const [isEditing, setIsEditing] = useState(false);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false); // modal colores

  // (compat) si lo sigues usando en algún lado
  const [interestAffiliations] = useState<InterestAffiliations>({});

  // Cargar perfil existente para modo "edit"
  useEffect(() => {
    (async () => {
      const uid = getAuth().currentUser?.uid;
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

          // ⬇️ NUEVO: cargar social por modo
          setsocialLinksPersonal((existing as any).socialLinksPersonal ?? {});
          setsocialLinksProfessional(
            (existing as any).socialLinksProfessional ?? {},
          );

          // ⬇️ NUEVO: cargar gallery por modo
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

          setIsEditing(false);
          setIsNewProfile(false);
        } else {
          setMode('personal');
          setIsEditing(true);
          setIsNewProfile(true);
        }
      } catch {
        // opcional
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const COLOR_OPTIONS = [
    '#3B5A85',
    '#2B3A42',
    '#ADCBE3',
    '#FF8A65',
    '#4CAF50',
    '#9C27B0',
    '#FDD835',
    '#546E7A',
  ];

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

  const interestsCount =
    (mode ?? 'personal') === 'professional'
      ? professionalInterestsCount
      : personalInterestsCount;

  // ⬇️ NUEVO: counts por modo
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

  const handlePickColor = (c: string) => {
    setTopBarColor(c);
    setPickerOpen(false);
  };

  const handleToggleMode = async () => {
    const nextMode: 'personal' | 'professional' =
      (mode ?? 'personal') === 'personal' ? 'professional' : 'personal';

    // actualiza UI inmediatamente
    setMode(nextMode);

    try {
      const uid = getAuth().currentUser?.uid;
      if (!uid) return;
      await updateUserMode(uid, nextMode);
    } catch (e) {
      console.error('Error updating mode', e);
      // opcional: pequeño aviso sin frenar el flujo
      // Alert.alert('Error', 'Could not update mode.');
    }
  };

  const handleSave = async () => {
    await handleContinue();
    if (!isNewProfile) setIsEditing(false);
  };

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

      setIsLoading(true);
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      // subir imagen de header si es local
      let uploadedTopBarUrl: string | null = null;
      if (topBarImage && topBarImage.startsWith('file')) {
        uploadedTopBarUrl = await uploadTopBarImage(uid, topBarImage);
      } else {
        uploadedTopBarUrl = topBarImage ?? null;
      }

      // subir imagen de perfil si es local
      let uploadedImageUrl: string | null = null;
      if (profileImage && profileImage.startsWith('file')) {
        uploadedImageUrl = await uploadProfileImage(uid, profileImage);
      } else {
        uploadedImageUrl = profileImage ?? null;
      }

      // (si sigues usando interestAffiliations en otro lado)
      const selectedInterestLabels = Object.keys(
        interestAffiliations,
      ) as InterestLabel[];

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
      };

      await saveCompleteProfile(uid, payload);

      Alert.alert('Success', 'Profile saved successfully.');
      navigation.navigate('MainTabs');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const goToSocialMedia = () => {
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('Profile', {
        screen: 'SocialMedia',
        params: { mode: mode ?? 'personal' },
      });
      return;
    }
    navigation.navigate('MainTabs');
    setTimeout(
      () =>
        navigation.getParent?.()?.navigate('Profile', {
          screen: 'SocialMedia',
          params: { mode: mode ?? 'personal' },
        }),
      0,
    );
  };

  const goToAffiliations = () => {
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('Profile', {
        screen: 'Affiliations',
        params: { mode: mode ?? 'personal' },
      });
      return;
    }
    navigation.navigate('MainTabs');
    setTimeout(
      () =>
        navigation.getParent?.()?.navigate('Profile', {
          screen: 'Affiliations',
          params: { mode: mode ?? 'personal' },
        }),
      0,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* HEADER unificado */}
      <TopHeader
        topBarMode={topBarMode}
        topBarColor={topBarColor}
        topBarImage={topBarImage}
        profileImage={profileImage}
        onLeftPress={() => navigation.goBack()}
        rightIcon={!isEditing ? 'pencil' : undefined}
        onRightPress={isEditing ? handleSave : () => setIsEditing(true)}
        rightDisabled={isLoading}
        rightLoading={isLoading}
        showAvatar
      />

      {/* Controles flotantes sobre el header (solo en edición) */}
      {isEditing && (
        <View
          style={[
            styles.floatingControlsWrap,
            { top: insets.top + 110 }, // respeta notch
          ]}
          pointerEvents="box-none"
        >
          {/* Modo color/imagen */}
          <View style={styles.modePillWrap}>
            <TouchableOpacity
              style={[
                styles.modePillOpt,
                topBarMode === 'color' && styles.modePillOptActive,
              ]}
              onPress={() => setTopBarMode('color')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.modePillText,
                  topBarMode === 'color' && styles.modePillTextActive,
                ]}
              >
                🎨
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modePillOpt,
                topBarMode === 'image' && styles.modePillOptActive,
              ]}
              onPress={() => setTopBarMode('image')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.modePillText,
                  topBarMode === 'image' && styles.modePillTextActive,
                ]}
              >
                🖼️
              </Text>
            </TouchableOpacity>
          </View>

          {/* Selector según modo */}
          {topBarMode === 'color' ? (
            <TouchableOpacity
              style={styles.headerTinyBtn}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="color-palette" size={16} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.headerTinyBtn}
              onPress={pickTopBarImage}
              onLongPress={() => setTopBarImage(null)}
              activeOpacity={0.85}
            >
              <Ionicons name="image" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Botón para cambiar foto de perfil (solo en edición) */}
      {isEditing && (
        <TouchableOpacity
          onPress={pickImage}
          style={styles.changePhotoBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="camera" size={14} color="#fff" />
          <Text style={styles.changePhotoText}>Change profile photo</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingBottom: isEditing ? 100 : 30, // 👈 más espacio si hay barra inferior
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Your Profile</Text>

        {/* Campos */}
        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, isEditing && styles.inputEditing]}
            placeholder="Real Name"
            placeholderTextColor="#9CA3AF"
            value={realName}
            onChangeText={(text) => setRealName(text)}
            editable={isEditing}
            maxLength={NAME_MAX}
          />
        </View>

        {/* Occupation */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Occupation</Text>
          <TextInput
            style={[styles.input, isEditing && styles.inputEditing]}
            placeholder="Occupation"
            placeholderTextColor="#9CA3AF"
            value={occupation}
            onChangeText={(text) => setOccupation(text)}
            editable={isEditing}
            maxLength={OCCUPATION_MAX}
          />
        </View>

        {/* Status (short tagline) */}
        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.charCounter}>
              {status.length}/{STATUS_MAX}
            </Text>
          </View>
          <TextInput
            style={[styles.input, isEditing && styles.inputEditing]}
            placeholder="Short status (e.g. 'Open to meet new people')"
            placeholderTextColor="#9CA3AF"
            value={status}
            onChangeText={(text) => setStatus(text)}
            editable={isEditing}
            maxLength={STATUS_MAX}
          />
        </View>

        {/* Biography */}
        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Biography</Text>
            <Text style={styles.charCounter}>
              {bio.length}/{BIO_MAX}
            </Text>
          </View>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              isEditing && styles.inputEditing,
            ]}
            placeholder="Short Biography (Eg: Likes | Career | Study ...)"
            placeholderTextColor="#9CA3AF"
            value={bio}
            onChangeText={(text) => setBio(text)}
            multiline
            numberOfLines={4}
            editable={isEditing}
            maxLength={BIO_MAX}
          />
        </View>

        {/* Switch de modo */}
        <View style={styles.switchWrap}>
          <ModeSwitch
            mode={(mode || 'personal') as 'personal' | 'professional'}
            topBarColor={'#3B5A85'}
            onToggle={handleToggleMode}
          />
        </View>

        {/* Campos adicionales (professional) */}
        {mode === 'professional' && (
          <View style={styles.professionalContainer}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Company</Text>
              <TextInput
                style={[styles.input, isEditing && styles.inputEditing]}
                placeholder="Company"
                placeholderTextColor="#9CA3AF"
                value={company}
                onChangeText={(text) => setCompany(text)}
                editable={isEditing}
                maxLength={COMPANY_MAX}
              />
            </View>
          </View>
        )}

        {/* Quick Actions */}
        {!isNewProfile && (
          <ProfileQuickActions
            stats={{
              interestsCount,
              socialCount,
              photosCount,
              affiliationsCount,
            }}
            onOpenInterests={() => {
              const uid = getAuth().currentUser?.uid;
              navigation.navigate('Interests', {
                uid,
                mode, // 'personal' | 'professional'
                personalAff,
                professionalAff,
              });
            }}
            onOpenSocial={goToSocialMedia}
            onOpenGallery={() => {
              const uid = getAuth().currentUser?.uid;
              navigation.navigate('Gallery', { uid, mode }); // ⬅️ PASAMOS MODE
            }}
            onOpenAffiliations={goToAffiliations} // 👈 NUEVO
          />
        )}

        {/* Loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2B3A42" />
              <Text style={styles.loadingText}>Saving your profile...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <ColorPickerModal
        visible={pickerOpen}
        initialColor={topBarColor}
        onClose={() => setPickerOpen(false)}
        onSelect={(color) => {
          setTopBarColor(color);
          setPickerOpen(false); // ahora solo se ejecuta al darle "Apply color"
        }}
      />

      {/* Barra fija inferior para guardar (solo en edición) */}
      {isEditing && (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 },
          ]}
        >
          <TouchableOpacity
            style={[styles.bottomSaveBtn, isLoading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isLoading}
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Controles flotantes sobre el header
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

  // Body
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginTop: 30,
    marginBottom: 16,
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
    backgroundColor: '#EEF2FF', // un toque más claro (opcional)
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

  // Loading overlay
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

  // Modal colores
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
});
