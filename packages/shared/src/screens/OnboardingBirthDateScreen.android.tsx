// src/screens/OnboardingBirthDateScreen.android.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
  Alert,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RegistrationLayout } from '../components/registration/RegistrationLayout';
import { RegistrationProgress } from '../components/registration/RegistrationProgress';
import { RegistrationFadeSlideIn } from '../components/registration/RegistrationFadeSlideIn';
import { FormInput } from '../components/registration/FormInput';
import { authPhaseProgress } from '../components/registration/crjProgress';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';
import { RootStackParamList } from '../navigation/types';
import { updateUserProfilePartial, getUserProfile } from '../services/firestoreService';
import { applyPostAuthNavigation } from '../phoneOtp/applyPostAuthNavigation';
import { buildBirthDatePersistencePatch } from '../settings/settingsContracts';
import {
  ageFromBirthDate,
  applyBirthDateTextChange,
  birthDatePlaceholderForOrder,
  birthPartsFromDigits,
  birthPartsToLocalDate,
  commitCalendarSelection,
  formatBirthDateDigits,
  isBirthDateInFuture,
  isCompleteBirthDate,
  localDateToBirthParts,
  maxAdultBirthDate,
  meetsRegistrationAgeRange,
  MAX_REGISTRATION_AGE,
  minRegistrationBirthDate,
  MIN_REGISTRATION_AGE,
  resolveBirthDateOrder,
  resolveCalendarInitialBirthDate,
} from '../utils/birthDate';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingBirthDate'>;

type NativeDateTimePickerProps = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  display?: 'default' | 'spinner' | 'compact' | 'inline' | 'calendar';
  maximumDate?: Date;
  minimumDate?: Date;
  locale?: string;
  themeVariant?: 'light' | 'dark';
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  onChange?: (event: { type?: string }, date?: Date) => void;
};

function loadRegistrationDateTimePicker(): React.ComponentType<NativeDateTimePickerProps> | null {
  try {
    // Avoid UIManager probes — missing native views can hang New Architecture.
    const { NativeModules } = require('react-native') as typeof import('react-native');
    if (!NativeModules?.RNDateTimePicker) return null;
    return require('@react-native-community/datetimepicker')
      .default as React.ComponentType<NativeDateTimePickerProps>;
  } catch {
    return null;
  }
}

export default function OnboardingBirthDateScreen({ route, navigation }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [birthDigits, setBirthDigits] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<Date | null>(null);
  const NativeDateTimePicker = useMemo(
    () => loadRegistrationDateTimePicker(),
    [],
  );

  const deviceLocaleTag =
    Localization.getLocales()[0]?.languageTag ?? 'en-US';
  const birthOrder = useMemo(
    () => resolveBirthDateOrder(deviceLocaleTag),
    [deviceLocaleTag],
  );
  const birthVisible = useMemo(
    () => formatBirthDateDigits(birthDigits, birthOrder),
    [birthDigits, birthOrder],
  );
  const birthPlaceholder = useMemo(() => {
    if (birthOrder === 'MDY') {
      return t('authentication.register.wizard.placeholders.birthDateMdy');
    }
    if (birthOrder === 'DMY') {
      return t('authentication.register.wizard.placeholders.birthDateDmy');
    }
    return t('authentication.register.wizard.placeholders.birthDateYmd');
  }, [birthOrder, t]);
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
  const age = useMemo(() => ageFromBirthDate(birthParts), [birthParts]);
  const ageOk = useMemo(
    () => meetsRegistrationAgeRange(birthParts),
    [birthParts],
  );
  const ageTooOld = useMemo(
    () =>
      birthComplete &&
      !birthFuture &&
      age !== null &&
      age > MAX_REGISTRATION_AGE,
    [birthComplete, birthFuture, age],
  );
  const birthDigitsFull = birthDigits.length === 8;
  const calendarMaxDate = useMemo(
    () => birthPartsToLocalDate(maxAdultBirthDate()) as Date,
    [],
  );
  const calendarMinDate = useMemo(
    () => birthPartsToLocalDate(minRegistrationBirthDate()) as Date,
    [],
  );

  function openBirthDateCalendar() {
    Keyboard.dismiss();
    const initial = resolveCalendarInitialBirthDate(birthParts);
    const asDate = birthPartsToLocalDate(initial);
    if (!asDate) return;
    setCalendarDraft(asDate);
    setCalendarOpen(true);
  }

  function cancelBirthDateCalendar() {
    setCalendarOpen(false);
    setCalendarDraft(null);
  }

  function applyCalendarDate(selectedDate: Date) {
    const selected = localDateToBirthParts(selectedDate);
    setBirthDigits(commitCalendarSelection(birthDigits, selected, birthOrder));
    setCalendarOpen(false);
    setCalendarDraft(null);
  }

  function blockedReason(): string | undefined {
    if (ageOk) return undefined;
    if (birthComplete && birthFuture) {
      return t('authentication.register.wizard.validation.birthFuture');
    }
    if (birthDigitsFull && !birthComplete) {
      return t('authentication.register.wizard.validation.birthInvalid');
    }
    if (age !== null && age < MIN_REGISTRATION_AGE) {
      return t('authentication.register.wizard.validation.birthMinimumAge');
    }
    if (ageTooOld) {
      return t('authentication.register.wizard.validation.birthMaximumAge', {
        age: MAX_REGISTRATION_AGE,
      });
    }
    return t('authentication.register.wizard.validation.birthIncomplete');
  }

  async function onContinue() {
    if (submitting || !ageOk) return;

    let patch;
    try {
      patch = buildBirthDatePersistencePatch(birthParts);
    } catch {
      return;
    }

    try {
      setSubmitting(true);
      const prior = await getUserProfile(route.params.uid);
      await updateUserProfilePartial(route.params.uid, patch);
      Keyboard.dismiss();
      await applyPostAuthNavigation(navigation as any, {
        uid: route.params.uid,
        email: route.params.email,
        profileSnapshot: {
          ...(prior ?? {}),
          ...patch,
        },
      });
    } catch (error) {
      if (__DEV__) {
        console.log('[OnboardingBirthDate] persist failed');
      }
      Alert.alert(
        t('common.error'),
        t('authentication.register.alerts.birthDateRequiredMessage'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RegistrationLayout
      footer={
        <PrimaryButton
          label={t('authentication.register.wizard.continue')}
          onPress={() => {
            void onContinue();
          }}
          disabled={!ageOk || submitting}
          loading={submitting}
          disabledReason={blockedReason()}
        />
      }
    >
      <View style={styles.header}>
        <RegistrationProgress progress={authPhaseProgress(2, 4)} />
      </View>

      <ScrollView
        style={styles.stepScroll}
        contentContainerStyle={[
          styles.stepBody,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RegistrationFadeSlideIn animKey="onboarding-birth">
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {t('authentication.register.wizard.steps.birth.title')}
          </Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            {t('authentication.register.wizard.steps.birth.subtitle')}
          </Text>
          <View style={styles.form}>
            <View style={styles.birthFieldRow}>
              <View style={styles.birthField}>
                <FormInput
                  label={t('authentication.register.wizard.fields.birthDate')}
                  placeholder={birthPlaceholder}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={birthVisible}
                  accessibilityLabel={t(
                    'authentication.register.wizard.fields.birthDate',
                  )}
                  accessibilityHint={birthDatePlaceholderForOrder(birthOrder)}
                  onChangeText={(v) =>
                    setBirthDigits(
                      applyBirthDateTextChange(birthVisible, v, birthOrder),
                    )
                  }
                />
              </View>
              {NativeDateTimePicker ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'authentication.register.wizard.a11y.birthDateCalendar',
                  )}
                  onPress={openBirthDateCalendar}
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
          </View>
          {birthComplete && birthFuture ? (
            <Text style={[styles.ageNote, { color: palette.danger }]}>
              {t('authentication.register.wizard.steps.birth.futureDate')}
            </Text>
          ) : null}
          {!birthComplete && birthDigitsFull ? (
            <Text style={[styles.ageNote, { color: palette.danger }]}>
              {t('authentication.register.wizard.steps.birth.invalidDate')}
            </Text>
          ) : null}
          {age !== null && !birthFuture ? (
            <Text
              style={[
                styles.ageNote,
                {
                  color:
                    ageOk && !ageTooOld
                      ? palette.textSecondary
                      : palette.danger,
                },
              ]}
            >
              {ageTooOld
                ? t('authentication.register.wizard.steps.birth.ageTooOld', {
                    age: MAX_REGISTRATION_AGE,
                  })
                : ageOk
                  ? t('authentication.register.wizard.steps.birth.ageOk', {
                      age,
                    })
                  : t('authentication.register.wizard.steps.birth.ageTooYoung')}
            </Text>
          ) : null}
        </RegistrationFadeSlideIn>
      </ScrollView>

      {NativeDateTimePicker && calendarOpen && calendarDraft ? (
        <NativeDateTimePicker
          value={calendarDraft}
          mode="date"
          display="default"
          maximumDate={calendarMaxDate}
          minimumDate={calendarMinDate}
          onChange={(event, date) => {
            if (event.type === 'dismissed') {
              cancelBirthDateCalendar();
              return;
            }
            if (date) applyCalendarDate(date);
          }}
        />
      ) : null}
    </RegistrationLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
  },
  stepScroll: {
    flex: 1,
  },
  stepBody: {
    paddingBottom: spacing.xl,
  },
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
    marginBottom: spacing.lg,
  },
  form: {
    gap: spacing.lg,
    marginTop: spacing.xxl,
  },
  birthFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  birthField: { flex: 1 },
  calendarBtn: {
    width: 50,
    height: 50,
    marginTop: fontSize.xs + 7,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageNote: {
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    lineHeight: fontSize.sm * 1.45,
  },
});
