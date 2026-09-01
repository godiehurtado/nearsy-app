/**
 * Registration wizard — auth phase only (Email → Password → Birth → Terms).
 *
 * Phone capture and OTP verification happen after account creation via the
 * central onboarding gate (PhoneVerificationScreen).
 *
 * Identity (Name / Last Name) is collected after Profile Type in ProfileCompletion.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Keyboard,
  Linking,
  TouchableOpacity,
  Modal,
  Platform,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { RegistrationLayout } from '../components/registration/RegistrationLayout';
import { RegistrationProgress } from '../components/registration/RegistrationProgress';
import { RegistrationFadeSlideIn } from '../components/registration/RegistrationFadeSlideIn';
import { FormInput } from '../components/registration/FormInput';
import { authPhaseProgress } from '../components/registration/crjProgress';
import {
  EMAIL_REGISTER_STEPS,
  type EmailRegisterStep,
} from '../components/registration/emailRegisterSteps';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import {
  ageFromBirthDate,
  applyBirthDateTextChange,
  birthDatePlaceholderForOrder,
  birthDateToIso,
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
import { registerWithEmail } from '../services/authService';
import { createUserProfile } from '../services/firestoreService';
import { useTranslation } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

type Step = EmailRegisterStep;

const TERMS_URL = 'https://nearsy.app/legal';

type FormState = {
  /** Digit buffer only (max 8); never the localized display string. */
  birthDigits: string;
  email: string;
  password: string;
};

function isStrongPassword(value: string) {
  if (value.length < 8) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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

export default function RegisterScreen({ navigation }: Props) {
  const { palette, theme } = useAppTheme();
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  /** iOS UIDatePickerStyleInline does not report Yoga intrinsic height. */
  const inlinePickerHeight = Math.min(
    380,
    Math.max(300, Math.round(windowHeight * 0.42)),
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<Date | null>(null);
  const NativeDateTimePicker = useMemo(() => loadIosDateTimePicker(), []);
  const [form, setForm] = useState<FormState>({
    birthDigits: '',
    email: '',
    password: '',
  });

  const step: Step = EMAIL_REGISTER_STEPS[stepIndex];
  const deviceLocaleTag =
    Localization.getLocales()[0]?.languageTag ?? 'en-US';
  const birthOrder = useMemo(
    () => resolveBirthDateOrder(deviceLocaleTag),
    [deviceLocaleTag],
  );
  const birthVisible = useMemo(
    () => formatBirthDateDigits(form.birthDigits, birthOrder),
    [form.birthDigits, birthOrder],
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
    () => birthPartsFromDigits(form.birthDigits, birthOrder),
    [form.birthDigits, birthOrder],
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
  const birthDigitsFull = form.birthDigits.length === 8;
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

  function confirmBirthDateCalendar() {
    const selected = calendarDraft
      ? localDateToBirthParts(calendarDraft)
      : null;
    update(
      'birthDigits',
      commitCalendarSelection(form.birthDigits, selected, birthOrder),
    );
    setCalendarOpen(false);
    setCalendarDraft(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function isStepValid(): boolean {
    switch (step) {
      case 'birth':
        return ageOk;
      case 'email':
        return isValidEmail(form.email);
      case 'password':
        return isStrongPassword(form.password);
      case 'terms':
        return acceptedTerms;
    }
  }

  function blockedReason(): string | undefined {
    if (isStepValid()) return undefined;
    switch (step) {
      case 'birth':
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
      case 'email':
        return t('authentication.register.wizard.validation.email');
      case 'password':
        return t('authentication.register.wizard.validation.password');
      case 'terms':
        if (!acceptedTerms) {
          return t('authentication.register.wizard.validation.terms');
        }
        return undefined;
      default:
        return undefined;
    }
  }

  function goBack() {
    if (stepIndex <= 0) {
      navigation.navigate('Welcome');
      return;
    }
    setStepIndex((i) => i - 1);
  }

  async function submitRegistration() {
    if (submitting) return;

    if (!acceptedTerms) {
      Alert.alert(
        t('authentication.register.alerts.termsRequiredTitle'),
        t('authentication.errors.termsRequired'),
      );
      return;
    }

    const isoBirthDate = birthDateToIso(birthParts);
    const year = birthParts.year;

    if (!isoBirthDate || year == null || !meetsRegistrationAgeRange(birthParts)) {
      Alert.alert(
        t('authentication.register.alerts.birthDateRequiredTitle'),
        ageTooOld
          ? t('authentication.register.alerts.maximumAgeMessage', {
              age: MAX_REGISTRATION_AGE,
            })
          : t('authentication.register.alerts.minimumAgeMessage'),
      );
      return;
    }

    try {
      setSubmitting(true);
      const { user } = await registerWithEmail(
        form.email.trim(),
        form.password,
      );

      await createUserProfile(user.uid, {
        email: form.email.trim(),
        birthYear: year,
        birthDate: isoBirthDate,
        phone: null,
        phoneVerified: false,
        phoneVerifiedAt: null,
        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),
      });

      Keyboard.dismiss();
    } catch (e: any) {
      const code = e?.code as string | undefined;
      let message = t('authentication.errors.default');
      if (code === 'auth/email-already-in-use') {
        message = t('authentication.errors.emailAlreadyInUse');
      } else if (code === 'auth/weak-password') {
        message = t('authentication.errors.weakPasswordRegister');
      } else if (code === 'auth/network-request-failed') {
        message = t('authentication.errors.networkError');
      }
      Alert.alert(t('authentication.register.alerts.invalidEmailTitle'), message);
    } finally {
      setSubmitting(false);
    }
  }

  async function goNext() {
    if (!isStepValid() || submitting) return;
    if (step === 'terms') {
      await submitRegistration();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  return (
    <RegistrationLayout
      footer={
        <PrimaryButton
          label={
            step === 'terms'
              ? t('authentication.register.wizard.createAccount')
              : t('authentication.register.wizard.continue')
          }
          onPress={() => {
            void goNext();
          }}
          disabled={!isStepValid() || submitting}
          loading={submitting}
          disabledReason={blockedReason()}
        />
      }
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('authentication.register.wizard.backA11y')}
          onPress={goBack}
          style={[
            styles.backBtn,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 22, lineHeight: 24 }}>
            {'\u2039'}
          </Text>
        </Pressable>
        <RegistrationProgress
          progress={authPhaseProgress(stepIndex, EMAIL_REGISTER_STEPS.length)}
        />
      </View>

      <ScrollView
        style={styles.stepScroll}
        contentContainerStyle={styles.stepBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RegistrationFadeSlideIn animKey={step}>
          {step === 'birth' && (
            <>
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
                        update(
                          'birthDigits',
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
            </>
          )}

          {step === 'email' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('authentication.register.wizard.steps.email.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('authentication.register.wizard.steps.email.subtitle')}
              </Text>
              <View style={styles.form}>
                <FormInput
                  label={t('authentication.register.wizard.fields.email')}
                  placeholder={t(
                    'authentication.register.wizard.placeholders.email',
                  )}
                  value={form.email}
                  onChangeText={(v) => update('email', v)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
            </>
          )}

          {step === 'password' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('authentication.register.wizard.steps.password.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('authentication.register.wizard.steps.password.subtitle')}
              </Text>
              <View style={styles.form}>
                <FormInput
                  label={t('authentication.register.wizard.fields.password')}
                  placeholder={t(
                    'authentication.register.wizard.placeholders.password',
                  )}
                  value={form.password}
                  onChangeText={(v) => update('password', v)}
                  secureTextEntry
                />
              </View>
            </>
          )}

          {step === 'terms' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('authentication.register.wizard.steps.terms.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('authentication.register.wizard.steps.terms.subtitle')}
              </Text>
              <View style={styles.termsRow}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => setAcceptedTerms((prev) => !prev)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedTerms }}
                >
                  <Ionicons
                    name={acceptedTerms ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={palette.primary}
                  />
                </TouchableOpacity>
                <Text style={[styles.termsText, { color: palette.textSecondary }]}>
                  {t('authentication.register.termsPrefix')}{' '}
                  <Text
                    style={[styles.termsLink, { color: palette.primary }]}
                    onPress={() => {
                      void Linking.openURL(TERMS_URL);
                    }}
                  >
                    {t('authentication.register.termsLink')}
                  </Text>
                  .
                </Text>
              </View>
            </>
          )}
        </RegistrationFadeSlideIn>
      </ScrollView>
      {NativeDateTimePicker && calendarOpen && calendarDraft ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={cancelBirthDateCalendar}
        >
          <View style={styles.calendarOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={cancelBirthDateCalendar}
            />
            <View
              style={[
                styles.calendarSheet,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <View style={styles.calendarHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                  onPress={cancelBirthDateCalendar}
                  hitSlop={8}
                >
                  <Text style={[styles.calendarAction, { color: palette.textSecondary }]}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
                <Text
                  style={[styles.calendarTitle, { color: palette.textPrimary }]}
                  numberOfLines={1}
                >
                  {t('authentication.register.birthDateModalTitle')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'authentication.register.wizard.calendarDone',
                  )}
                  onPress={confirmBirthDateCalendar}
                  hitSlop={8}
                >
                  <Text style={[styles.calendarAction, { color: palette.primary }]}>
                    {t('authentication.register.wizard.calendarDone')}
                  </Text>
                </Pressable>
              </View>
              <View
                style={[
                  styles.calendarPickerArea,
                  { height: inlinePickerHeight },
                ]}
              >
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
                      cancelBirthDateCalendar();
                      return;
                    }
                    if (date) setCalendarDraft(date);
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </RegistrationLayout>
  );
}

const styles = StyleSheet.create({
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
  stepBody: { paddingBottom: spacing.xl },
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
  form: { gap: spacing.lg, marginTop: spacing.xxl },
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
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  calendarSheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingBottom: spacing.md,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  calendarPickerArea: {
    width: '100%',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  calendarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  calendarAction: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    minWidth: 64,
  },
  ageNote: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    paddingHorizontal: 4,
  },
  checkbox: {
    marginRight: 8,
    marginTop: 1,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  termsLink: {
    fontWeight: fontWeight.bold,
    textDecorationLine: 'underline',
  },
});
