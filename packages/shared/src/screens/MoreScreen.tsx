// src/screens/MoreScreen.tsx ✅ Hybrid (Auth RNFirebase + Firestore Web SDK)
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import TopHeader from '../components/TopHeader';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  changeAppLanguage,
  isSupportedLanguage,
  useTranslation,
  type SupportedLanguage,
} from '../i18n';

import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';

// 👇 contactos
import {
  isContactsSyncEnabled,
  setContactsSyncEnabled,
  syncContactsSafe,
  disableContactsSyncAndPurge,
} from '../services/contactsSync';

// ✅ Firestore Web SDK
import { doc, getDoc, setDoc } from 'firebase/firestore';

type ProfileDoc = {
  profileImage?: string | null;
  topBarColor?: string;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';

  phone?: string;
  birthYear?: number;
  visibleToMinAge?: number | null;
  visibleToMaxAge?: number | null;
  blockedContacts?: string[];
  bgVisible?: boolean;

  phoneVerified?: boolean;
};

type FieldId = 'phone' | 'birthYear' | 'visibilityAges' | 'blocked';

type CountryPhoneOption = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
};

const LANGUAGE_OPTIONS: Array<{
  code: SupportedLanguage;
  labelKey: 'settings.language.english' | 'settings.language.spanish';
}> = [
  { code: 'en', labelKey: 'settings.language.english' },
  { code: 'es', labelKey: 'settings.language.spanish' },
];

const AMERICA_COUNTRIES: CountryPhoneOption[] = [
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { code: 'BZ', name: 'Belize', dialCode: '+501', flag: '🇧🇿' },
  { code: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { code: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { code: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { code: 'PA', name: 'Panama', dialCode: '+507', flag: '🇵🇦' },
  { code: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { code: 'DO', name: 'Dominican Republic', dialCode: '+1', flag: '🇩🇴' },
  { code: 'HT', name: 'Haiti', dialCode: '+509', flag: '🇭🇹' },
  { code: 'JM', name: 'Jamaica', dialCode: '+1', flag: '🇯🇲' },
  { code: 'TT', name: 'Trinidad and Tobago', dialCode: '+1', flag: '🇹🇹' },
  { code: 'BS', name: 'Bahamas', dialCode: '+1', flag: '🇧🇸' },
  { code: 'BB', name: 'Barbados', dialCode: '+1', flag: '🇧🇧' },
  { code: 'AG', name: 'Antigua and Barbuda', dialCode: '+1', flag: '🇦🇬' },
  { code: 'DM', name: 'Dominica', dialCode: '+1', flag: '🇩🇲' },
  { code: 'GD', name: 'Grenada', dialCode: '+1', flag: '🇬🇩' },
  { code: 'KN', name: 'Saint Kitts and Nevis', dialCode: '+1', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia', dialCode: '+1', flag: '🇱🇨' },
  {
    code: 'VC',
    name: 'Saint Vincent and the Grenadines',
    dialCode: '+1',
    flag: '🇻🇨',
  },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { code: 'GY', name: 'Guyana', dialCode: '+592', flag: '🇬🇾' },
  { code: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { code: 'SR', name: 'Suriname', dialCode: '+597', flag: '🇸🇷' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
];

function sanitizePhoneNumber(value: string) {
  return value.replace(/\D/g, '');
}

function buildFullPhoneNumber(dialCode: string, localPhone: string): string {
  const cleanDialCode = dialCode.replace(/\D/g, '');
  const cleanLocalPhone = sanitizePhoneNumber(localPhone);
  return `+${cleanDialCode}${cleanLocalPhone}`;
}

function isValidE164Phone(fullPhone: string) {
  if (!fullPhone) return false;
  return /^\+[1-9]\d{7,14}$/.test(fullPhone);
}

function splitStoredPhone(value?: string | null): {
  country: CountryPhoneOption;
  localPhone: string;
} {
  const fallback =
    AMERICA_COUNTRIES.find((c) => c.code === 'US') || AMERICA_COUNTRIES[0];

  if (!value) {
    return { country: fallback, localPhone: '' };
  }

  const normalized = value.replace(/\s+/g, '');

  if (normalized.startsWith('+1')) {
    const usCountry =
      AMERICA_COUNTRIES.find((c) => c.code === 'US') || fallback;

    return {
      country: usCountry,
      localPhone: normalized.slice(2),
    };
  }

  const sorted = [...AMERICA_COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );

  const match = sorted.find((c) => normalized.startsWith(c.dialCode));

  if (!match) {
    return { country: fallback, localPhone: normalized.replace(/^\+/, '') };
  }

  return {
    country: match,
    localPhone: normalized.slice(match.dialCode.length),
  };
}

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  const currentLanguage: SupportedLanguage = isSupportedLanguage(i18n.language)
    ? i18n.language
    : 'en';

  const currentLanguageLabel =
    currentLanguage === 'es'
      ? t('settings.language.spanish')
      : t('settings.language.english');

  // top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // user email
  const [userEmail, setUserEmail] = useState<string>('');

  // phone actual en Firestore (para detectar cambios)
  const [originalPhone, setOriginalPhone] = useState('');

  // phone UI
  const [selectedCountry, setSelectedCountry] = useState<CountryPhoneOption>(
    AMERICA_COUNTRIES.find((c) => c.code === 'US') || AMERICA_COUNTRIES[0],
  );
  const [countryModalOpen, setCountryModalOpen] = useState(false);

  // data editable
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState<string>('');
  const [visibleToMinAge, setVisibleToMinAge] = useState<string>('');
  const [visibleToMaxAge, setVisibleToMaxAge] = useState<string>('');
  const [blockedContacts, setBlockedContacts] = useState<string[]>([]);
  const [newBlocked, setNewBlocked] = useState('');

  // ui
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // field editing
  const [activeField, setActiveField] = useState<FieldId | null>(null);
  const isFieldActive = (f: FieldId) => activeField === f;
  const isEditingAny = activeField !== null;

  // BG location toggle
  const [bgVisible, setBgVisible] = useState<boolean>(false);
  const [bgChanging, setBgChanging] = useState<boolean>(false);

  // contactos
  const [contactsEnabled, setContactsEnabled] = useState<boolean>(false);
  const [contactsChanging, setContactsChanging] = useState<boolean>(false);

  // language
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) return;

        setUserEmail(firebaseAuth.currentUser?.email ?? '');

        const snap = await getDoc(doc(firestoreDb, 'users', uid));

        if (snap.exists()) {
          const data = snap.data() as ProfileDoc;

          // top bar
          setTopBarColor(data.topBarColor ?? '#3B5A85');
          setTopBarMode(
            data.topBarMode ?? (data.topBarImage ? 'image' : 'color'),
          );
          setTopBarImage(data.topBarImage ?? null);
          setProfileImage(data.profileImage ?? null);

          // phone
          const phoneFromDb = data.phone ?? '';
          setOriginalPhone(phoneFromDb);

          const splitPhone = splitStoredPhone(phoneFromDb);
          setSelectedCountry(splitPhone.country);
          setPhone(splitPhone.localPhone);

          // birth year
          setBirthYear(
            typeof data.birthYear === 'number' && data.birthYear > 1900
              ? String(data.birthYear)
              : '',
          );

          // age visibility
          setVisibleToMinAge(
            typeof data.visibleToMinAge === 'number'
              ? String(data.visibleToMinAge)
              : '',
          );
          setVisibleToMaxAge(
            typeof data.visibleToMaxAge === 'number'
              ? String(data.visibleToMaxAge)
              : '',
          );

          // blocked contacts
          setBlockedContacts(
            Array.isArray(data.blockedContacts) ? data.blockedContacts : [],
          );

          // bg visibility
          setBgVisible(!!data.bgVisible);
        }

        const enabled = await isContactsSyncEnabled();
        setContactsEnabled(enabled);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const validateAndParse = () => {
    const localPhone = sanitizePhoneNumber(phone);
    const fullPhone = localPhone
      ? buildFullPhoneNumber(selectedCountry.dialCode, localPhone)
      : '';

    // ✅ Teléfono opcional en TODAS las plataformas
    if (fullPhone && !isValidE164Phone(fullPhone)) {
      throw new Error(
        'If you set a phone number, it must be valid. Please select your country and enter a valid mobile number.',
      );
    }

    const by = birthYear.trim() ? Number(birthYear.trim()) : undefined;
    if (birthYear.trim()) {
      if (isNaN(by!) || by! < 1900 || by! > currentYear) {
        throw new Error('Birth year must be a valid year.');
      }
    }

    const minA = visibleToMinAge.trim()
      ? Number(visibleToMinAge.trim())
      : undefined;
    const maxA = visibleToMaxAge.trim()
      ? Number(visibleToMaxAge.trim())
      : undefined;

    if (minA !== undefined && (isNaN(minA) || minA < 13 || minA > 120))
      throw new Error('Min age must be between 13 and 120.');
    if (maxA !== undefined && (isNaN(maxA) || maxA < 13 || maxA > 120))
      throw new Error('Max age must be between 13 and 120.');

    if (minA !== undefined && maxA !== undefined && minA > maxA)
      throw new Error('Min age cannot be greater than max age.');

    return {
      phone: fullPhone || null,
      birthYear: by,
      visibleToMinAge: minA ?? null,
      visibleToMaxAge: maxA ?? null,
      blockedContacts,
    };
  };

  const handleToggleBg = async (next: boolean) => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Auth', 'Please log in again.');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert(
        'Unsupported',
        'Background location is not available on web.',
      );
      return;
    }

    try {
      setBgChanging(true);

      await setDoc(
        doc(firestoreDb, 'users', uid),
        { bgVisible: next, updatedAt: Date.now() },
        { merge: true },
      );

      if (next) {
        await startBackgroundLocation({ uid });
        setBgVisible(true);
        Alert.alert(
          'Enabled',
          'You will stay visible to nearby users in background.',
        );
      } else {
        await stopBackgroundLocation();
        setBgVisible(false);
        Alert.alert('Disabled', 'Background visibility is now off.');
      }
    } catch (e: any) {
      setBgVisible(!next);
      const msg = e?.message || 'Could not update background location.';
      Alert.alert('Error', msg);
    } finally {
      setBgChanging(false);
    }
  };

  const handleToggleContacts = async (next: boolean) => {
    try {
      setContactsChanging(true);

      if (next) {
        const ok = await syncContactsSafe();

        if (!ok) {
          await setContactsSyncEnabled(false);
          setContactsEnabled(false);

          Alert.alert(
            'Contacts permission',
            'If you want Nearsy to use contacts, you can enable Contacts access in Settings.',
          );
          return;
        }

        await setContactsSyncEnabled(true);
        setContactsEnabled(true);

        Alert.alert(
          'Contacts enabled',
          'Nearsy can now highlight familiar people in nearby alerts.',
        );
      } else {
        await disableContactsSyncAndPurge();
        await setContactsSyncEnabled(false);
        setContactsEnabled(false);

        Alert.alert(
          'Contacts disabled',
          'Nearsy will no longer use your contacts for nearby alerts.',
        );
      }
    } catch (e: any) {
      setContactsEnabled((prev) => prev);
      Alert.alert(
        'Error',
        e?.message || 'Could not update contacts permission.',
      );
    } finally {
      setContactsChanging(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const parsed = validateAndParse();
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      const updateData: any = {
        phone: parsed.phone,
        birthYear: parsed.birthYear,
        visibleToMinAge: parsed.visibleToMinAge,
        visibleToMaxAge: parsed.visibleToMaxAge,
        blockedContacts: parsed.blockedContacts,
        updatedAt: Date.now(),
      };

      await setDoc(doc(firestoreDb, 'users', uid), updateData, { merge: true });

      setOriginalPhone(parsed.phone ?? '');
      Alert.alert('Saved', 'Your settings have been updated.');
      setActiveField(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectLanguage = async (language: SupportedLanguage) => {
    if (!isSupportedLanguage(language)) return;

    if (language === currentLanguage) {
      setLanguageModalOpen(false);
      return;
    }

    try {
      setLanguageChanging(true);
      await changeAppLanguage(language);
      setLanguageModalOpen(false);
      Alert.alert(t('common.appName'), t('settings.language.changeSuccess'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setLanguageChanging(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { clearPendingSocialProfilePrefill } = await import(
        '../authentication/social'
      );
      clearPendingSocialProfilePrefill();
      await firebaseAuth.signOut();

      const parent = navigation.getParent?.();

      if (parent) {
        parent.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    } catch (error: any) {
      Alert.alert('Logout error', error?.message ?? 'Unknown error');
    }
  };

  const addBlocked = () => {
    if (!isFieldActive('blocked')) return;

    const v = newBlocked.trim();
    if (!v) return;

    const isEmail = isValidEmail(v);
    const isPhoneVal = isValidE164Phone(v.replace(/\s+/g, ''));

    if (!isEmail && !isPhoneVal) {
      Alert.alert(
        'Invalid contact',
        'Please enter a valid email address or phone number.',
      );
      return;
    }

    const norm = isEmail ? v.toLowerCase() : v.replace(/\s+/g, '');

    if (blockedContacts.includes(norm)) {
      Alert.alert('Notice', 'This contact is already in your blocked list.');
      return;
    }

    setBlockedContacts((prev) => [norm, ...prev]);
    setNewBlocked('');
  };

  const removeBlocked = (value: string) => {
    if (!isFieldActive('blocked')) return;
    setBlockedContacts((prev) => prev.filter((x) => x !== value));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
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
          contentContainerStyle={{
            paddingBottom: isEditingAny ? 110 : 40,
          }}
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

          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <View style={styles.emailPill}>
              <Text style={styles.emailText}>
                {userEmail || 'No email available'}
              </Text>
            </View>

            {/* Phone */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Phone number</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'phone' ? null : 'phone',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isFieldActive('phone') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.phoneContainer}>
                <TouchableOpacity
                  style={[
                    styles.countrySelector,
                    isFieldActive('phone') && styles.countrySelectorEditing,
                    !isFieldActive('phone') && styles.inputDisabled,
                  ]}
                  activeOpacity={isFieldActive('phone') ? 0.8 : 1}
                  onPress={() =>
                    isFieldActive('phone') && setCountryModalOpen(true)
                  }
                  disabled={!isFieldActive('phone')}
                >
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryDialCode}>
                    {selectedCountry.dialCode}
                  </Text>
                  {isFieldActive('phone') && (
                    <Ionicons name="chevron-down" size={16} color="#475569" />
                  )}
                </TouchableOpacity>

                <TextInput
                  style={[
                    styles.phoneInput,
                    isFieldActive('phone') && styles.inputEditing,
                    !isFieldActive('phone') && styles.inputDisabled,
                  ]}
                  placeholder="Phone number (optional)"
                  value={phone}
                  onChangeText={(value) =>
                    setPhone(value.replace(/[^\d]/g, ''))
                  }
                  editable={isFieldActive('phone')}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.hint}>
                Optional. This phone is used for contact purposes inside Nearsy
                and is not public.
              </Text>
            </View>

            {/* Birth year */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Year of birth</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'birthYear' ? null : 'birthYear',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isFieldActive('birthYear') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('birthYear') && styles.inputEditing,
                  !isFieldActive('birthYear') && styles.inputDisabled,
                ]}
                placeholder="1995"
                value={birthYear}
                onChangeText={setBirthYear}
                editable={isFieldActive('birthYear')}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>

            {/* Age visibility */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Visibility by age</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'visibilityAges' ? null : 'visibilityAges',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={
                      isFieldActive('visibilityAges') ? '#3B5A85' : '#9CA3AF'
                    }
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Hide me from users younger than</Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('visibilityAges') && styles.inputEditing,
                  !isFieldActive('visibilityAges') && styles.inputDisabled,
                ]}
                placeholder="e.g., 18"
                value={visibleToMinAge}
                onChangeText={setVisibleToMinAge}
                editable={isFieldActive('visibilityAges')}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={[styles.label, { marginTop: 8 }]}>
                Hide me from users older than
              </Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('visibilityAges') && styles.inputEditing,
                  !isFieldActive('visibilityAges') && styles.inputDisabled,
                ]}
                placeholder="e.g., 65"
                value={visibleToMaxAge}
                onChangeText={setVisibleToMaxAge}
                editable={isFieldActive('visibilityAges')}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.hint}>
                Leave blank any of them if you don’t want to set that limit.
              </Text>
            </View>

            {/* Background visibility */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Stay visible in background</Text>

              <View style={styles.row}>
                <Text style={{ flex: 1, color: '#374151' }}>
                  Keep your location updated so others can discover you nearby
                  even when the app is closed.
                </Text>

                <Switch
                  value={bgVisible}
                  onValueChange={handleToggleBg}
                  disabled={bgChanging}
                />
              </View>

              <Text style={styles.hint}>
                Requires “Always” location permission. On iOS, a blue indicator
                may appear while Nearsy updates your location in background.
              </Text>

              {bgVisible && (
                <Text
                  style={{
                    marginTop: 8,
                    color: '#065F46',
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  Background visibility is ON.
                </Text>
              )}
            </View>

            {/* Contacts card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Use phone contacts for alerts
              </Text>

              <View style={styles.row}>
                <Text style={{ flex: 1, color: '#374151' }}>
                  Sync your phone contacts to highlight familiar people in
                  nearby alerts.
                </Text>

                <Switch
                  value={contactsEnabled}
                  onValueChange={handleToggleContacts}
                  disabled={contactsChanging}
                />
              </View>

              <Text style={styles.hint}>
                This is optional. We only store minimal identifiers (no contact
                names or messages are sent to your contacts).
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('settings.language.title')}</Text>

              <Text style={[styles.hint, { marginBottom: 12 }]}>
                {t('settings.language.description')}
              </Text>

              <Text style={styles.hint}>
                {t('settings.language.current', {
                  language: currentLanguageLabel,
                })}
              </Text>

              <TouchableOpacity
                style={styles.languageSelectorBtn}
                onPress={() => setLanguageModalOpen(true)}
                disabled={languageChanging}
                activeOpacity={0.85}
              >
                <Text style={styles.languageSelectorBtnText}>
                  {currentLanguageLabel}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Blocked contacts */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Blocked contacts</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'blocked' ? null : 'blocked',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isFieldActive('blocked') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.row}>
                <TextInput
                  style={[
                    styles.input,
                    styles.flex1,
                    isFieldActive('blocked') && styles.inputEditing,
                    !isFieldActive('blocked') && styles.inputDisabled,
                  ]}
                  placeholder="Email or phone to block"
                  value={newBlocked}
                  onChangeText={setNewBlocked}
                  editable={isFieldActive('blocked')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
                <TouchableOpacity
                  onPress={addBlocked}
                  disabled={!isFieldActive('blocked') || !newBlocked.trim()}
                  style={[
                    styles.addBtn,
                    (!isFieldActive('blocked') || !newBlocked.trim()) && {
                      opacity: 0.6,
                    },
                  ]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {blockedContacts.length > 0 ? (
                <View style={styles.chipsWrap}>
                  {blockedContacts.map((v) => (
                    <View key={v} style={styles.chip}>
                      <Text style={styles.chipText}>{v}</Text>
                      {isFieldActive('blocked') && (
                        <TouchableOpacity
                          onPress={() => removeBlocked(v)}
                          style={styles.chipRemove}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800' }}>
                            ✕
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.hint}>
                  You can block contacts by email or phone number.
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.9}
            >
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                marginTop: 14,
                backgroundColor: '#B91C1C',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
              }}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('DeleteAccount')}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>
                Delete account
              </Text>
            </TouchableOpacity>

            <View style={{ height: 12 + insets.bottom }} />
          </View>
        </ScrollView>

        {isEditingAny && (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 },
            ]}
          >
            <TouchableOpacity
              style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.bottomSaveText}>Save settings</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={countryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCountryModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCountryModalOpen(false)}
        >
          <Pressable style={styles.countryModalCard}>
            <Text style={styles.modalTitle}>Select country code</Text>

            <FlatList
              data={AMERICA_COUNTRIES}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={false}
              style={{ width: '100%' }}
              renderItem={({ item }) => {
                const isSelected = item.code === selectedCountry.code;

                return (
                  <TouchableOpacity
                    style={[
                      styles.countryOption,
                      isSelected && styles.countryOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedCountry(item);
                      setCountryModalOpen(false);
                    }}
                  >
                    <View style={styles.countryOptionLeft}>
                      <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                      <View>
                        <Text style={styles.countryOptionName}>
                          {item.name}
                        </Text>
                        <Text style={styles.countryOptionDialCode}>
                          {item.dialCode}
                        </Text>
                      </View>
                    </View>

                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#3B5A85"
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={languageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLanguageModalOpen(false)}
        >
          <Pressable style={styles.countryModalCard}>
            <Text style={styles.modalTitle}>
              {t('settings.language.title')}
            </Text>

            <Text style={[styles.hint, { marginBottom: 12 }]}>
              {t('settings.language.description')}
            </Text>

            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = option.code === currentLanguage;

              return (
                <TouchableOpacity
                  key={option.code}
                  style={[
                    styles.countryOption,
                    isSelected && styles.countryOptionSelected,
                  ]}
                  onPress={() => handleSelectLanguage(option.code)}
                  disabled={languageChanging}
                >
                  <Text style={styles.countryOptionName}>
                    {t(option.labelKey)}
                  </Text>

                  {isSelected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color="#3B5A85"
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.languageModalCloseBtn}
              onPress={() => setLanguageModalOpen(false)}
              disabled={languageChanging}
              activeOpacity={0.85}
            >
              <Text style={styles.languageModalCloseBtnText}>
                {t('common.buttons.close')}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  emailPill: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  emailText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 13, color: '#374151', marginBottom: 6 },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inputDisabled: { opacity: 0.7 },
  inputEditing: {
    borderWidth: 1.5,
    borderColor: '#3B5A85',
    backgroundColor: '#EEF2FF',
  },

  phoneContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countrySelector: {
    minWidth: 110,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countrySelectorEditing: {
    borderWidth: 1.5,
    borderColor: '#3B5A85',
    backgroundColor: '#EEF2FF',
  },
  countryFlag: {
    fontSize: 18,
    marginRight: 6,
  },
  countryDialCode: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    marginRight: 6,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 46,
  },

  hint: { color: '#6B7280', marginTop: 8, fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  addBtn: {
    backgroundColor: '#3B5A85',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: { color: '#111827' },
  chipRemove: {
    marginLeft: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutBtn: {
    marginTop: 10,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },

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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  countryModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  countryOption: {
    width: '100%',
    minHeight: 58,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryOptionSelected: {
    backgroundColor: '#EEF4FA',
  },
  countryOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryOptionFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  countryOptionName: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  countryOptionDialCode: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  languageSelectorBtn: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageSelectorBtnText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  languageModalCloseBtn: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageModalCloseBtnText: {
    color: '#3B5A85',
    fontWeight: '700',
    fontSize: 15,
  },
});
