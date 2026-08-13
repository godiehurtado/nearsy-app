/**
 * Registration wizard — auth phase only (Birth → Email → Password → Phone+Terms).
 *
 * TEMPORARY BYPASS (documented):
 *   Phone → (OTP pending — not implemented) → Firebase Email Authentication
 * Phone is mandatory and persisted with phoneVerified: false.
 * No SMS is sent; the UI must not claim a code was delivered.
 *
 * Identity (Name / Last Name) is collected after Profile Type in ProfileCompletion.
 * Progress shows a visual bar only — never n/N step counts.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { RegistrationLayout } from '../components/registration/RegistrationLayout';
import { RegistrationProgress } from '../components/registration/RegistrationProgress';
import { RegistrationFadeSlideIn } from '../components/registration/RegistrationFadeSlideIn';
import { FormInput } from '../components/registration/FormInput';
import { REGISTRATION_COUNTRIES } from '../components/registration/countries';
import { authPhaseProgress } from '../components/registration/crjProgress';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import {
  ageFromBirthDate,
  birthDateToIso,
  birthPartsFromStrings,
  isBirthDateInFuture,
  isCompleteBirthDate,
  meetsMinimumRegistrationAge,
  MIN_REGISTRATION_AGE,
} from '../utils/birthDate';
import { registerWithEmail } from '../services/authService';
import { createUserProfile } from '../services/firestoreService';
import { useTranslation } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

const EMAIL_STEPS = ['birth', 'email', 'password', 'phone'] as const;
type Step = (typeof EMAIL_STEPS)[number];

const TERMS_URL = 'https://nearsy.app/legal';

type FormState = {
  birth: { day: string; month: string; year: string };
  email: string;
  password: string;
  countryDial: string;
  phone: string;
};

function isStrongPassword(value: string) {
  if (value.length < 8) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function sanitizePhoneNumber(value: string) {
  return value.replace(/\D/g, '');
}

function buildFullPhoneNumber(dialCode: string, localPhone: string): string {
  const cleanDialCode = dialCode.replace(/\D/g, '');
  const cleanLocalPhone = sanitizePhoneNumber(localPhone);
  return `+${cleanDialCode}${cleanLocalPhone}`;
}

function isValidPhone(fullPhone: string) {
  return /^\+[1-9]\d{7,14}$/.test(fullPhone);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function RegisterScreen({ navigation }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [stepIndex, setStepIndex] = useState(0);
  const [showCountries, setShowCountries] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [form, setForm] = useState<FormState>({
    birth: { day: '', month: '', year: '' },
    email: '',
    password: '',
    countryDial: REGISTRATION_COUNTRIES[0].dial,
    phone: '',
  });

  const step: Step = EMAIL_STEPS[stepIndex];
  const birthParts = useMemo(
    () => birthPartsFromStrings(form.birth),
    [form.birth],
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
    () => meetsMinimumRegistrationAge(birthParts),
    [birthParts],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function isPhoneValid(): boolean {
    const full = buildFullPhoneNumber(
      form.countryDial,
      sanitizePhoneNumber(form.phone),
    );
    return isValidPhone(full);
  }

  function isStepValid(): boolean {
    switch (step) {
      case 'birth':
        return ageOk;
      case 'email':
        return isValidEmail(form.email);
      case 'password':
        return isStrongPassword(form.password);
      case 'phone':
        return isPhoneValid() && acceptedTerms;
    }
  }

  function blockedReason(): string | undefined {
    if (isStepValid()) return undefined;
    switch (step) {
      case 'birth':
        if (birthComplete && birthFuture) {
          return t('authentication.register.wizard.validation.birthFuture');
        }
        if (
          form.birth.day &&
          form.birth.month &&
          form.birth.year &&
          !birthComplete
        ) {
          return t('authentication.register.wizard.validation.birthInvalid');
        }
        if (age !== null && age < MIN_REGISTRATION_AGE) {
          return t('authentication.register.wizard.validation.birthMinimumAge');
        }
        return t('authentication.register.wizard.validation.birthIncomplete');
      case 'email':
        return t('authentication.register.wizard.validation.email');
      case 'password':
        return t('authentication.register.wizard.validation.password');
      case 'phone':
        if (!isPhoneValid()) {
          return t('authentication.register.wizard.validation.phone');
        }
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
    setShowCountries(false);
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

    const localPhone = sanitizePhoneNumber(form.phone);
    const normalizedPhone = buildFullPhoneNumber(form.countryDial, localPhone);
    const isoBirthDate = birthDateToIso(birthParts);
    const year = birthParts.year;

    if (!isoBirthDate || year == null || !meetsMinimumRegistrationAge(birthParts)) {
      Alert.alert(
        t('authentication.register.alerts.birthDateRequiredTitle'),
        t('authentication.register.alerts.minimumAgeMessage'),
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
        phone: normalizedPhone,
        phoneVerified: false,
        phoneVerifiedAt: null,
        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),
        // TEMPORARY BYPASS: Phone → OTP pending → Firebase Auth (this call).
        // No SMS is sent in this sprint.
      });

      Keyboard.dismiss();
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'ProfileCompletion',
              params: {
                uid: user.uid,
                email: user.email ?? form.email.trim(),
                inputNonce: Date.now(),
              },
            },
          ],
        });
      }, 150);
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
    if (step === 'phone') {
      await submitRegistration();
      return;
    }
    setShowCountries(false);
    setStepIndex((i) => i + 1);
  }

  const selectedCountry =
    REGISTRATION_COUNTRIES.find((c) => c.dial === form.countryDial) ??
    REGISTRATION_COUNTRIES[0];

  return (
    <RegistrationLayout
      footer={
        <PrimaryButton
          label={
            step === 'phone'
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
          progress={authPhaseProgress(stepIndex, EMAIL_STEPS.length)}
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
              <View style={styles.dateRow}>
                <View style={styles.dateCell}>
                  <FormInput
                    label={t('authentication.register.wizard.fields.day')}
                    placeholder={t(
                      'authentication.register.wizard.placeholders.day',
                    )}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={form.birth.day}
                    onChangeText={(v) =>
                      update('birth', {
                        ...form.birth,
                        day: v.replace(/\D/g, ''),
                      })
                    }
                  />
                </View>
                <View style={styles.dateCell}>
                  <FormInput
                    label={t('authentication.register.wizard.fields.month')}
                    placeholder={t(
                      'authentication.register.wizard.placeholders.month',
                    )}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={form.birth.month}
                    onChangeText={(v) =>
                      update('birth', {
                        ...form.birth,
                        month: v.replace(/\D/g, ''),
                      })
                    }
                  />
                </View>
                <View style={styles.dateCellWide}>
                  <FormInput
                    label={t('authentication.register.wizard.fields.year')}
                    placeholder={t(
                      'authentication.register.wizard.placeholders.year',
                    )}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={form.birth.year}
                    onChangeText={(v) =>
                      update('birth', {
                        ...form.birth,
                        year: v.replace(/\D/g, ''),
                      })
                    }
                  />
                </View>
              </View>
              {birthComplete && birthFuture ? (
                <Text style={[styles.ageNote, { color: palette.danger }]}>
                  {t('authentication.register.wizard.steps.birth.futureDate')}
                </Text>
              ) : null}
              {!birthComplete &&
              form.birth.day &&
              form.birth.month &&
              form.birth.year ? (
                <Text style={[styles.ageNote, { color: palette.danger }]}>
                  {t('authentication.register.wizard.steps.birth.invalidDate')}
                </Text>
              ) : null}
              {age !== null && !birthFuture ? (
                <Text
                  style={[
                    styles.ageNote,
                    {
                      color: ageOk ? palette.textSecondary : palette.danger,
                    },
                  ]}
                >
                  {ageOk
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

          {step === 'phone' && (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                {t('authentication.register.wizard.steps.phone.title')}
              </Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                {t('authentication.register.wizard.steps.phone.subtitle')}
              </Text>
              <View style={styles.phoneRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'authentication.register.wizard.selectCountryA11y',
                  )}
                  onPress={() => setShowCountries((v) => !v)}
                  style={[
                    styles.dialBtn,
                    {
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: palette.textPrimary,
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.bold,
                    }}
                  >
                    {selectedCountry.flag} {form.countryDial}
                  </Text>
                </Pressable>
                <View style={styles.phoneField}>
                  <FormInput
                    placeholder={t(
                      'authentication.register.wizard.placeholders.phone',
                    )}
                    keyboardType="phone-pad"
                    value={form.phone}
                    onChangeText={(v) =>
                      update('phone', v.replace(/[^\d]/g, ''))
                    }
                  />
                </View>
              </View>
              {showCountries ? (
                <View
                  style={[
                    styles.countryList,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.panel,
                    },
                  ]}
                >
                  <ScrollView
                    style={{ maxHeight: 220 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {REGISTRATION_COUNTRIES.map((c) => (
                      <Pressable
                        key={`${c.iso2}-${c.dial}`}
                        onPress={() => {
                          update('countryDial', c.dial);
                          setShowCountries(false);
                        }}
                        style={styles.countryRow}
                      >
                        <Text
                          style={{
                            color: palette.textPrimary,
                            fontSize: fontSize.base,
                          }}
                        >
                          {c.flag} {c.name}
                        </Text>
                        <Text
                          style={{
                            color: palette.textSecondary,
                            fontSize: fontSize.sm,
                          }}
                        >
                          {c.dial}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

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
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  dateCell: { flex: 1 },
  dateCellWide: { flex: 1.6 },
  ageNote: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    alignItems: 'flex-start',
  },
  dialBtn: {
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
    minHeight: 50,
    justifyContent: 'center',
  },
  phoneField: { flex: 1 },
  countryList: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
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
