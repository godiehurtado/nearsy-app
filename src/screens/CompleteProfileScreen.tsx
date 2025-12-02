// src/screens/CompleteProfileScreen.tsx
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
  Switch,
  PixelRatio,
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
  const isLargeText = PixelRatio.getFontScale() >= 1.2;
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
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false); // modal colores

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

  // (compat) si lo sigues usando en algún lado
  const [interestAffiliations] = useState<InterestAffiliations>({});

  // Cargar perfil existente (lo usaremos en el foco de la pantalla)
  const loadProfile = useCallback(async () => {
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
      // opcional: podrías mostrar un Alert si quieres
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cada vez que la pantalla gana foco, recargamos el perfil y por ende los contadores
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

  // ✅ Hay edición si:
  // - es perfil nuevo
  // - hay campo activo
  // - o el panel de topbar está abierto
  const isEditingAny =
    isNewProfile || activeField !== null || showTopBarControls;

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
      if (__DEV__) {
        console.error('[CompleteProfile] Error updating mode', e);
      }
      // opcional: pequeño aviso sin frenar el flujo
      // Alert.alert('Error', 'Could not update mode.');
    }
  };

  const handleSave = async () => {
    await handleContinue();

    if (!isNewProfile) {
      setActiveField(null);
      setShowTopBarControls(false);
    }
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
        showAvatar
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: isEditingAny ? 100 : 30,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeaderRow}>
          <View style={styles.profileHeaderInner}>
            <Text style={styles.title}>Your Profile</Text>
            <TouchableOpacity
              style={[
                styles.profileCameraBtn,
                showTopBarControls && styles.profileCameraBtnActive,
              ]}
              onPress={() => setShowTopBarControls((prev) => !prev)}
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

            {/* Cambiar foto de perfil */}
            <TouchableOpacity
              onPress={pickImage}
              style={styles.inlinePhotoBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.inlinePhotoText}>Change profile photo</Text>
            </TouchableOpacity>

            {/* Switch color / imagen */}
            <View style={styles.topBarModeRow}>
              <Text style={styles.topBarLabel}>Top bar style</Text>
              <View style={styles.topBarSwitchRow}>
                <Text style={styles.topBarSwitchText}>Color</Text>
                <Switch
                  value={topBarMode === 'image'}
                  onValueChange={(value) =>
                    setTopBarMode(value ? 'image' : 'color')
                  }
                  trackColor={{ false: '#CBD5F5', true: '#CBD5F5' }}
                  thumbColor={topBarMode === 'image' ? '#3B5A85' : '#3B5A85'}
                />
                <Text style={styles.topBarSwitchText}>Image</Text>
              </View>
            </View>

            {/* Acción según modo */}
            {topBarMode === 'color' ? (
              <TouchableOpacity
                style={styles.topBarActionBtn}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="color-palette" size={16} color="#1F2937" />
                <Text style={styles.topBarActionText}>Pick top bar color</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.topBarActionBtn}
                onPress={pickTopBarImage}
                onLongPress={() => setTopBarImage(null)}
                activeOpacity={0.85}
              >
                <Ionicons name="image" size={16} color="#1F2937" />
                <Text style={styles.topBarActionText}>Pick header image</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Campos */}
        {/* Name */}
        <View style={styles.fieldGroup}>
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
            style={[
              styles.input,
              canEditField('realName') && styles.inputEditing,
            ]}
            placeholder="Real Name"
            placeholderTextColor="#9CA3AF"
            value={realName}
            onChangeText={setRealName}
            editable={canEditField('realName')}
            maxLength={NAME_MAX}
          />
        </View>

        {/* Occupation */}
        <View style={styles.fieldGroup}>
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
            style={[
              styles.input,
              canEditField('occupation') && styles.inputEditing,
            ]}
            placeholder="Occupation"
            placeholderTextColor="#9CA3AF"
            value={occupation}
            onChangeText={setOccupation}
            editable={canEditField('occupation')}
            maxLength={OCCUPATION_MAX}
          />
        </View>

        {/* Status (short tagline) */}
        <View style={styles.fieldGroup}>
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
            style={[
              styles.input,
              canEditField('status') && styles.inputEditing,
            ]}
            placeholder="Short status (e.g. '🇺🇸 Open to meet new people')"
            placeholderTextColor="#9CA3AF"
            value={status}
            onChangeText={setStatus}
            editable={canEditField('status')}
            maxLength={STATUS_MAX}
          />
        </View>

        {/* Biography */}
        <View style={styles.fieldGroup}>
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
            style={[
              styles.input,
              styles.textArea,
              canEditField('bio') && styles.inputEditing,
            ]}
            placeholder="Short Biography (e.g. '🇺🇸 From USA · Likes coffee · Marketing · Study ...')"
            placeholderTextColor="#9CA3AF"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            editable={canEditField('bio')}
            maxLength={BIO_MAX}
          />
        </View>

        {/* Switch de modo */}
        <View style={styles.switchWrap}>
          <ModeSwitch
            mode={(mode || 'personal') as 'personal' | 'professional'}
            topBarColor={'#3B5A85'}
            onToggle={handleToggleMode}
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
            onOpenAffiliations={goToAffiliations}
            compact={isLargeText} // 👈 nuevo prop
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
      {isEditingAny && (
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

  profileHeaderRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 30,
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
    backgroundColor: '#EF4444', // opcional: rojo suave para indicar "cerrar"
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
