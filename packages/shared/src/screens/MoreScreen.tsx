/**
 * Settings hub — Nearsy 2.0 More tab (Unit 2A).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsToggleRow } from '../components/settings/SettingsToggleRow';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  changeAppLanguage,
  isSupportedLanguage,
  useTranslation,
  type SupportedLanguage,
} from '../i18n';
import type { MoreStackParamList } from '../navigation/MoreStack';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';
import {
  ageFromBirthDate,
  applyBirthDateTextChange,
  birthDatePlaceholderForOrder,
  birthPartsFromDigits,
  birthPartsFromIso,
  birthPartsToLocalDate,
  formatBirthDateDigits,
  isBirthDateInFuture,
  isCompleteBirthDate,
  localDateToBirthParts,
  maxAdultBirthDate,
  minBirthDateParts,
  resolveBirthDateOrder,
  resolveCalendarInitialBirthDate,
} from '../utils/birthDate';
import {
  buildBirthDatePersistencePatch,
  buildPhoneSavePatch,
  formatVisibilityAgeSummary,
  SETTINGS_MAX_AGE,
  SETTINGS_MIN_AGE,
  validateSettingsBirthDate,
  validateVisibilityAgeRange,
} from '../settings/settingsContracts';
import {
  AMERICA_COUNTRIES,
  birthDigitsFromParts,
  buildFullPhoneNumber,
  sanitizePhoneNumber,
  splitStoredPhone,
  type CountryPhoneOption,
} from '../settings/settingsPhoneCountries';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';

type ProfileDoc = {
  phone?: string | null;
  birthDate?: string | null;
  birthYear?: number | null;
  visibleToMinAge?: number | null;
  visibleToMaxAge?: number | null;
  bgVisible?: boolean;
};

type EditorKind = 'phone' | 'birthDate' | 'visibilityAge' | null;

const LANGUAGE_OPTIONS: Array<{
  code: SupportedLanguage;
  labelKey: 'settings.language.english' | 'settings.language.spanish';
}> = [
  { code: 'en', labelKey: 'settings.language.english' },
  { code: 'es', labelKey: 'settings.language.spanish' },
];

type NativeDateTimePickerProps = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  display?: 'default' | 'spinner' | 'compact' | 'inline';
  maximumDate?: Date;
  minimumDate?: Date;
  locale?: string;
  themeVariant?: 'light' | 'dark';
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  onChange?: (event: { type?: string }, date?: Date) => void;
};

function loadIosDateTimePicker(): React.ComponentType<NativeDateTimePickerProps> | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('@react-native-community/datetimepicker')
      .default as React.ComponentType<NativeDateTimePickerProps>;
  } catch {
    return null;
  }
}

function formatBirthDisplay(
  birthDate: string | null | undefined,
  localeTag: string,
  notSet: string,
): string {
  if (!birthDate) return notSet;
  const parts = birthPartsFromIso(birthDate);
  const date = parts ? birthPartsToLocalDate(parts) : null;
  if (!date) return notSet;
  try {
    return date.toLocaleDateString(localeTag, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return birthDate;
  }
}

function minAge99BirthDate(asOf: Date = new Date()) {
  return {
    year: asOf.getFullYear() - SETTINGS_MAX_AGE,
    month: asOf.getMonth() + 1,
    day: asOf.getDate(),
  };
}

export default function MoreScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const insets = useSafeAreaInsets();
  const { palette, theme } = useAppTheme();
  const { t, i18n } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const NativeDateTimePicker = useMemo(() => loadIosDateTimePicker(), []);
  const inlinePickerHeight = Math.min(
    380,
    Math.max(300, Math.round(windowHeight * 0.42)),
  );

  const deviceLocaleTag =
    Localization.getLocales()?.[0]?.languageTag ?? 'en-US';
  const birthOrder = useMemo(
    () => resolveBirthDateOrder(deviceLocaleTag),
    [deviceLocaleTag],
  );

  const currentLanguage: SupportedLanguage = isSupportedLanguage(i18n.language)
    ? i18n.language
    : 'en';
  const currentLanguageLabel =
    currentLanguage === 'es'
      ? t('settings.language.spanish')
      : t('settings.language.english');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [storedPhone, setStoredPhone] = useState<string | null>(null);
  const [birthDateIso, setBirthDateIso] = useState<string | null>(null);
  const [visibleToMinAge, setVisibleToMinAge] = useState<number | null>(null);
  const [visibleToMaxAge, setVisibleToMaxAge] = useState<number | null>(null);
  const [bgVisible, setBgVisible] = useState(false);
  const [bgChanging, setBgChanging] = useState(false);

  const [editor, setEditor] = useState<EditorKind>(null);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState<CountryPhoneOption>(
    AMERICA_COUNTRIES.find((c) => c.code === 'US') || AMERICA_COUNTRIES[0],
  );
  const [phoneLocal, setPhoneLocal] = useState('');
  const [birthDigits, setBirthDigits] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<Date | null>(null);
  const [draftMinAge, setDraftMinAge] = useState('');
  const [draftMaxAge, setDraftMaxAge] = useState('');

  const birthVisible = useMemo(
    () => formatBirthDateDigits(birthDigits, birthOrder),
    [birthDigits, birthOrder],
  );
  const birthParts = useMemo(
    () => birthPartsFromDigits(birthDigits, birthOrder),
    [birthDigits, birthOrder],
  );
  const birthComplete = useMemo(
    () => isCompleteBirthDate(birthParts),
    [birthParts],
  );
  const birthFuture = useMemo(
    () => isBirthDateInFuture(birthParts),
    [birthParts],
  );
  const birthAge = useMemo(() => ageFromBirthDate(birthParts), [birthParts]);
  const birthValidation = useMemo(
    () => validateSettingsBirthDate(birthParts),
    [birthParts],
  );

  const calendarMaxDate = useMemo(
    () => birthPartsToLocalDate(maxAdultBirthDate()) as Date,
    [],
  );
  const calendarMinDate = useMemo(() => {
    const capped = minAge99BirthDate();
    const absolute = minBirthDateParts();
    const use = capped.year > absolute.year ? capped : absolute;
    return birthPartsToLocalDate(use) as Date;
  }, []);

  const reloadProfile = useCallback(async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    setUserEmail(firebaseAuth.currentUser?.email ?? '');
    const snap = await getDoc(doc(firestoreDb, 'users', uid));
    if (!snap.exists()) {
      setLoading(false);
      return;
    }
    const data = snap.data() as ProfileDoc;
    setStoredPhone(data.phone ?? null);
    const split = splitStoredPhone(data.phone ?? null);
    setSelectedCountry(split.country);
    setPhoneLocal(split.localPhone);
    setBirthDateIso(
      typeof data.birthDate === 'string' && data.birthDate
        ? data.birthDate
        : null,
    );
    setVisibleToMinAge(
      typeof data.visibleToMinAge === 'number' ? data.visibleToMinAge : null,
    );
    setVisibleToMaxAge(
      typeof data.visibleToMaxAge === 'number' ? data.visibleToMaxAge : null,
    );
    setBgVisible(!!data.bgVisible);
    setLoading(false);
  }, []);

  useEffect(() => {
    reloadProfile().catch((e: any) => {
      Alert.alert(t('common.error'), e?.message || t('settings.loadError'));
      setLoading(false);
    });
  }, [reloadProfile, t]);

  const closeEditor = () => setEditor(null);

  const openPhoneEditor = () => {
    const split = splitStoredPhone(storedPhone);
    setSelectedCountry(split.country);
    setPhoneLocal(split.localPhone);
    setEditor('phone');
  };

  const openBirthEditor = () => {
    if (birthDateIso) {
      const parts = birthPartsFromIso(birthDateIso);
      setBirthDigits(parts ? birthDigitsFromParts(parts, birthOrder) : '');
    } else {
      setBirthDigits('');
    }
    setEditor('birthDate');
  };

  const openVisibilityEditor = () => {
    setDraftMinAge(
      typeof visibleToMinAge === 'number' ? String(visibleToMinAge) : '',
    );
    setDraftMaxAge(
      typeof visibleToMaxAge === 'number' ? String(visibleToMaxAge) : '',
    );
    setEditor('visibilityAge');
  };

  const savePhone = async () => {
    try {
      setSaving(true);
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error(t('settings.backgroundVisibility.authRequired'));
      const local = sanitizePhoneNumber(phoneLocal);
      const full = local
        ? buildFullPhoneNumber(selectedCountry.dialCode, local)
        : null;
      const patch = buildPhoneSavePatch({
        previousPhone: storedPhone,
        nextPhone: full,
      });
      const updateData: Record<string, unknown> = {
        phone: patch.phone,
        updatedAt: Date.now(),
      };
      if (patch.verification) {
        updateData.phoneVerified = patch.verification.phoneVerified;
        updateData.phoneVerifiedAt = patch.verification.phoneVerifiedAt;
      }
      await setDoc(doc(firestoreDb, 'users', uid), updateData, { merge: true });
      setStoredPhone(patch.phone);
      Alert.alert(t('common.appName'), t('settings.phone.saved'));
      closeEditor();
    } catch (e: any) {
      if (e?.message === 'INVALID_PHONE') {
        Alert.alert(t('common.error'), t('settings.phone.invalid'));
      } else {
        Alert.alert(t('common.error'), e?.message || t('settings.saveError'));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveBirthDate = async () => {
    try {
      setSaving(true);
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error(t('settings.backgroundVisibility.authRequired'));
      const validated = validateSettingsBirthDate(birthParts);
      if (validated.ok === false) {
        const msg =
          validated.reason === 'too_young'
            ? t('settings.birthDate.tooYoung', { age: SETTINGS_MIN_AGE })
            : validated.reason === 'too_old'
              ? t('settings.birthDate.tooOld', { age: SETTINGS_MAX_AGE })
              : validated.reason === 'incomplete'
                ? t('settings.birthDate.incomplete')
                : t('settings.birthDate.invalid');
        Alert.alert(t('common.error'), msg);
        return;
      }
      const persistence = buildBirthDatePersistencePatch(birthParts);
      await setDoc(
        doc(firestoreDb, 'users', uid),
        {
          birthDate: persistence.birthDate,
          birthYear: persistence.birthYear,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      setBirthDateIso(persistence.birthDate);
      Alert.alert(t('common.appName'), t('settings.birthDate.saved'));
      closeEditor();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const saveVisibilityAge = async () => {
    try {
      setSaving(true);
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error(t('settings.backgroundVisibility.authRequired'));
      const validated = validateVisibilityAgeRange(draftMinAge, draftMaxAge);
      if (validated.ok === false) {
        const msg =
          validated.reason === 'order'
            ? t('settings.visibilityAge.order')
            : validated.reason === 'min_bounds'
              ? t('settings.visibilityAge.minBounds', {
                  min: SETTINGS_MIN_AGE,
                  max: SETTINGS_MAX_AGE,
                })
              : t('settings.visibilityAge.maxBounds', {
                  min: SETTINGS_MIN_AGE,
                  max: SETTINGS_MAX_AGE,
                });
        Alert.alert(t('common.error'), msg);
        return;
      }
      await setDoc(
        doc(firestoreDb, 'users', uid),
        {
          visibleToMinAge: validated.min,
          visibleToMaxAge: validated.max,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      setVisibleToMinAge(validated.min);
      setVisibleToMaxAge(validated.max);
      Alert.alert(t('common.appName'), t('settings.visibilityAge.saved'));
      closeEditor();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBg = async (next: boolean) => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      Alert.alert(
        t('common.error'),
        t('settings.backgroundVisibility.authRequired'),
      );
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert(
        t('common.error'),
        t('settings.backgroundVisibility.unsupported'),
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
          t('common.appName'),
          t('settings.backgroundVisibility.enabled'),
        );
      } else {
        await stopBackgroundLocation();
        setBgVisible(false);
        Alert.alert(
          t('common.appName'),
          t('settings.backgroundVisibility.disabled'),
        );
      }
    } catch (e: any) {
      setBgVisible(!next);
      Alert.alert(
        t('common.error'),
        e?.message || t('settings.backgroundVisibility.error'),
      );
    } finally {
      setBgChanging(false);
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
      const parent = navigation.getParent?.() as any;
      if (parent?.reset) {
        parent.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else {
        (navigation as any).reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }
    } catch (error: any) {
      Alert.alert(
        t('common.error'),
        error?.message ?? t('settings.logout.error'),
      );
    }
  };

  const openCalendar = () => {
    const initial = resolveCalendarInitialBirthDate(birthParts);
    setCalendarDraft(birthPartsToLocalDate(initial));
    setCalendarOpen(true);
  };

  const confirmCalendar = () => {
    if (!calendarDraft) {
      setCalendarOpen(false);
      return;
    }
    setBirthDigits(
      birthDigitsFromParts(localDateToBirthParts(calendarDraft), birthOrder),
    );
    setCalendarOpen(false);
  };

  if (loading) {
    return (
      <View
        style={[styles.centered, { backgroundColor: palette.background }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('common.loading')}
      >
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  const phoneDisplay = storedPhone || t('settings.birthDate.notSet');
  const dobDisplay = formatBirthDisplay(
    birthDateIso,
    deviceLocaleTag,
    t('settings.birthDate.notSet'),
  );
  const visibilityDisplay = formatVisibilityAgeSummary(
    visibleToMinAge,
    visibleToMaxAge,
    t('settings.visibilityAge.notSet'),
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: 48 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={[styles.screenTitle, { color: palette.textPrimary }]}
        >
          {t('settings.title')}
        </Text>

        <SettingsSection title={t('settings.sections.account')}>
          <SettingsRow
            icon="mail-outline"
            title={t('settings.email.title')}
            value={userEmail || t('settings.email.missing')}
            showChevron={false}
          />
          <SettingsRow
            icon="call-outline"
            title={t('settings.phone.title')}
            value={phoneDisplay}
            onPress={openPhoneEditor}
            accessibilityHint={t('settings.editor.edit')}
          />
          <SettingsRow
            icon="calendar-outline"
            title={t('settings.birthDate.title')}
            value={dobDisplay}
            onPress={openBirthEditor}
            accessibilityHint={t('settings.editor.edit')}
            isLast
          />
        </SettingsSection>

        <SettingsSection title={t('settings.sections.privacy')}>
          <SettingsRow
            icon="people-outline"
            title={t('settings.visibilityAge.title')}
            value={visibilityDisplay}
            onPress={openVisibilityEditor}
            accessibilityHint={t('settings.editor.edit')}
          />
          <SettingsToggleRow
            icon="locate-outline"
            title={t('settings.backgroundVisibility.title')}
            description={t('settings.backgroundVisibility.description')}
            value={bgVisible}
            onValueChange={handleToggleBg}
            disabled={bgChanging}
          />
          <SettingsRow
            icon="hand-left-outline"
            title={t('settings.blockedPeople.title')}
            onPress={() => navigation.navigate('BlockedPeople')}
            accessibilityHint={t('settings.blockedPeople.openHint')}
            isLast
          />
        </SettingsSection>

        <Text
          style={[
            styles.bgHint,
            {
              color: palette.textMuted,
              paddingHorizontal: screenPadding.horizontal,
            },
          ]}
        >
          {t('settings.backgroundVisibility.hint')}
        </Text>

        <SettingsSection title={t('settings.sections.preferences')}>
          <SettingsRow
            icon="language-outline"
            title={t('settings.language.title')}
            value={currentLanguageLabel}
            onPress={() => setLanguageModalOpen(true)}
            isLast
          />
        </SettingsSection>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.logout.title')}
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              {
                backgroundColor: palette.dangerBg,
                borderColor: palette.danger,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={[styles.logoutText, { color: palette.danger }]}>
              {t('settings.logout.title')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.deleteAccount.title')}
            onPress={() => navigation.navigate('DeleteAccount')}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: palette.danger, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={styles.deleteText}>
              {t('settings.deleteAccount.title')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={editor === 'phone'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={[styles.editorRoot, { backgroundColor: palette.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.editorHeader,
              { paddingTop: spacing.lg, borderBottomColor: palette.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.editor.cancel')}
              onPress={closeEditor}
              hitSlop={8}
            >
              <Text style={{ color: palette.textSecondary, fontWeight: '600' }}>
                {t('settings.editor.cancel')}
              </Text>
            </Pressable>
            <Text
              style={[styles.editorTitle, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              {t('settings.phone.title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.editor.save')}
              onPress={savePhone}
              disabled={saving}
              hitSlop={8}
            >
              {saving ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <Text style={{ color: palette.primary, fontWeight: '700' }}>
                  {t('settings.editor.save')}
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.editorBody}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.phoneRow}>
              <Pressable
                onPress={() => setCountryModalOpen(true)}
                style={[
                  styles.countryBtn,
                  {
                    backgroundColor: palette.panel,
                    borderColor: palette.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('settings.phone.selectCountry')}
              >
                <Text style={{ fontSize: 18 }}>{selectedCountry.flag}</Text>
                <Text style={[styles.dialCode, { color: palette.textPrimary }]}>
                  {selectedCountry.dialCode}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={palette.textMuted}
                />
              </Pressable>
              <TextInput
                style={[
                  styles.phoneInput,
                  {
                    color: palette.textPrimary,
                    backgroundColor: palette.panel,
                    borderColor: palette.border,
                  },
                ]}
                placeholder={t('settings.phone.placeholder')}
                placeholderTextColor={palette.placeholder}
                value={phoneLocal}
                onChangeText={(v) => setPhoneLocal(v.replace(/[^\d]/g, ''))}
                keyboardType="phone-pad"
                accessibilityLabel={t('settings.phone.title')}
              />
            </View>
            <Text style={[styles.hint, { color: palette.textMuted }]}>
              {t('settings.phone.hint')}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editor === 'birthDate'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={[styles.editorRoot, { backgroundColor: palette.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.editorHeader,
              { paddingTop: spacing.lg, borderBottomColor: palette.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.editor.cancel')}
              onPress={closeEditor}
              hitSlop={8}
            >
              <Text style={{ color: palette.textSecondary, fontWeight: '600' }}>
                {t('settings.editor.cancel')}
              </Text>
            </Pressable>
            <Text
              style={[styles.editorTitle, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              {t('settings.birthDate.title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.editor.save')}
              onPress={saveBirthDate}
              disabled={saving}
              hitSlop={8}
            >
              {saving ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <Text style={{ color: palette.primary, fontWeight: '700' }}>
                  {t('settings.editor.save')}
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.editorBody}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.birthRow}>
              <TextInput
                style={[
                  styles.birthInput,
                  {
                    color: palette.textPrimary,
                    backgroundColor: palette.panel,
                    borderColor: palette.border,
                  },
                ]}
                placeholder={birthDatePlaceholderForOrder(birthOrder)}
                placeholderTextColor={palette.placeholder}
                keyboardType="number-pad"
                maxLength={10}
                value={birthVisible}
                onChangeText={(v) =>
                  setBirthDigits(
                    applyBirthDateTextChange(birthVisible, v, birthOrder),
                  )
                }
                accessibilityLabel={t('settings.birthDate.title')}
              />
              {NativeDateTimePicker ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'authentication.register.wizard.a11y.birthDateCalendar',
                  )}
                  onPress={openCalendar}
                  style={[
                    styles.calendarBtn,
                    {
                      backgroundColor: palette.panel,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={22}
                    color={palette.textPrimary}
                  />
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.hint, { color: palette.textMuted }]}>
              {t('settings.birthDate.hint')}
            </Text>
            {birthComplete && birthFuture ? (
              <Text style={[styles.hint, { color: palette.danger }]}>
                {t('settings.birthDate.invalid')}
              </Text>
            ) : null}
            {birthDigits.length === 8 && !birthComplete ? (
              <Text style={[styles.hint, { color: palette.danger }]}>
                {t('settings.birthDate.invalid')}
              </Text>
            ) : null}
            {birthAge != null && !birthFuture
              ? (() => {
                  const validation = birthValidation;
                  let message: string;
                  let okColor = false;
                  if (validation.ok === false) {
                    if (validation.reason === 'too_young') {
                      message = t('settings.birthDate.tooYoung', {
                        age: SETTINGS_MIN_AGE,
                      });
                    } else if (validation.reason === 'too_old') {
                      message = t('settings.birthDate.tooOld', {
                        age: SETTINGS_MAX_AGE,
                      });
                    } else {
                      message = t('settings.birthDate.invalid');
                    }
                  } else {
                    okColor = true;
                    message = String(birthAge);
                  }
                  return (
                    <Text
                      style={[
                        styles.hint,
                        {
                          color: okColor
                            ? palette.textSecondary
                            : palette.danger,
                        },
                      ]}
                    >
                      {message}
                    </Text>
                  );
                })()
              : null}
          </ScrollView>

          {NativeDateTimePicker && calendarOpen && calendarDraft ? (
            <View style={styles.calendarOverlay}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setCalendarOpen(false)}
              />
              <View
                style={[
                  styles.calendarSheet,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={styles.calendarHeader}>
                  <Pressable onPress={() => setCalendarOpen(false)} hitSlop={8}>
                    <Text style={{ color: palette.textSecondary }}>
                      {t('common.cancel')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={confirmCalendar} hitSlop={8}>
                    <Text style={{ color: palette.primary, fontWeight: '700' }}>
                      {t('authentication.register.wizard.calendarDone')}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ height: inlinePickerHeight }}>
                  <NativeDateTimePicker
                    value={calendarDraft}
                    mode="date"
                    display="inline"
                    locale={deviceLocaleTag}
                    themeVariant={theme === 'dark' ? 'dark' : 'light'}
                    accentColor={palette.primary}
                    style={{ width: '100%', height: inlinePickerHeight }}
                    maximumDate={calendarMaxDate}
                    minimumDate={calendarMinDate}
                    onChange={(event, date) => {
                      if (event.type === 'dismissed') {
                        setCalendarOpen(false);
                        return;
                      }
                      if (date) setCalendarDraft(date);
                    }}
                  />
                </View>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editor === 'visibilityAge'}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={[styles.editorRoot, { backgroundColor: palette.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.editorHeader,
              { paddingTop: spacing.lg, borderBottomColor: palette.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.editor.cancel')}
              onPress={closeEditor}
              hitSlop={8}
            >
              <Text style={{ color: palette.textSecondary, fontWeight: '600' }}>
                {t('settings.editor.cancel')}
              </Text>
            </Pressable>
            <Text
              style={[styles.editorTitle, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              {t('settings.visibilityAge.title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.editor.save')}
              onPress={saveVisibilityAge}
              disabled={saving}
              hitSlop={8}
            >
              {saving ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <Text style={{ color: palette.primary, fontWeight: '700' }}>
                  {t('settings.editor.save')}
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.editorBody}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
              {t('settings.visibilityAge.minLabel')}
            </Text>
            <TextInput
              style={[
                styles.fieldInput,
                {
                  color: palette.textPrimary,
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                },
              ]}
              value={draftMinAge}
              onChangeText={(v) => setDraftMinAge(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              placeholder={`${SETTINGS_MIN_AGE}`}
              placeholderTextColor={palette.placeholder}
              accessibilityLabel={t('settings.visibilityAge.minLabel')}
            />
            <Text
              style={[
                styles.fieldLabel,
                { color: palette.textSecondary, marginTop: spacing.md },
              ]}
            >
              {t('settings.visibilityAge.maxLabel')}
            </Text>
            <TextInput
              style={[
                styles.fieldInput,
                {
                  color: palette.textPrimary,
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                },
              ]}
              value={draftMaxAge}
              onChangeText={(v) => setDraftMaxAge(v.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              placeholder={`${SETTINGS_MAX_AGE}`}
              placeholderTextColor={palette.placeholder}
              accessibilityLabel={t('settings.visibilityAge.maxLabel')}
            />
            <Text style={[styles.hint, { color: palette.textMuted }]}>
              {t('settings.visibilityAge.hint', {
                min: SETTINGS_MIN_AGE,
                max: SETTINGS_MAX_AGE,
              })}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
          <Pressable
            style={[styles.modalCard, { backgroundColor: palette.surface }]}
          >
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
              {t('settings.phone.selectCountry')}
            </Text>
            <FlatList
              data={AMERICA_COUNTRIES}
              keyExtractor={(item) => item.code}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const selected = item.code === selectedCountry.code;
                return (
                  <Pressable
                    style={[
                      styles.countryOption,
                      selected && { backgroundColor: palette.chipBg },
                    ]}
                    onPress={() => {
                      setSelectedCountry(item);
                      setCountryModalOpen(false);
                    }}
                  >
                    <Text style={{ fontSize: 20, marginRight: 10 }}>
                      {item.flag}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: palette.textPrimary,
                          fontWeight: '600',
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text style={{ color: palette.textMuted }}>
                        {item.dialCode}
                      </Text>
                    </View>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={palette.primary}
                      />
                    ) : null}
                  </Pressable>
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
          <Pressable
            style={[styles.modalCard, { backgroundColor: palette.surface }]}
          >
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
              {t('settings.language.title')}
            </Text>
            <Text style={[styles.hint, { color: palette.textMuted }]}>
              {t('settings.language.description')}
            </Text>
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = option.code === currentLanguage;
              return (
                <Pressable
                  key={option.code}
                  style={[
                    styles.countryOption,
                    selected && { backgroundColor: palette.chipBg },
                  ]}
                  onPress={() => handleSelectLanguage(option.code)}
                  disabled={languageChanging}
                >
                  <Text
                    style={{
                      color: palette.textPrimary,
                      fontWeight: '600',
                      flex: 1,
                    }}
                  >
                    {t(option.labelKey)}
                  </Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={palette.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.closeBtn, { backgroundColor: palette.chipBg }]}
              onPress={() => setLanguageModalOpen(false)}
            >
              <Text style={{ color: palette.chipText, fontWeight: '700' }}>
                {t('common.buttons.close')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screenTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.lg,
  },
  bgHint: {
    fontSize: fontSize.xs,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
    lineHeight: fontSize.xs * 1.45,
  },
  actions: {
    paddingHorizontal: screenPadding.horizontal,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  logoutBtn: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  deleteBtn: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  editorRoot: { flex: 1 },
  editorHeader: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  editorTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  editorBody: {
    padding: screenPadding.horizontal,
    paddingTop: spacing.lg,
  },
  phoneRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  countryBtn: {
    minHeight: 48,
    minWidth: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dialCode: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  phoneInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  birthRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  birthInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  calendarBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  fieldInput: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  hint: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  countryOption: {
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeBtn: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  calendarSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingBottom: 24,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
