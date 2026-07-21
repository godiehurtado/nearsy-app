// RegisterScreen.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  Platform,
  Linking,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  TextInput as RNTextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { firebaseAuth } from '../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { registerWithEmail } from '../services/authService';
import { createUserProfile } from '../services/firestoreService';

// 🔒 Social login must be disabled + invisible for this version
const ENABLE_SOCIAL_LOGIN = false;

type CreateProfilePayload = {
  email: string;
  birthYear: number;
  phone?: string | null;
  acceptedTerms?: boolean;
  acceptedTermsAt?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: string | null;
};

type CountryPhoneOption = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
};

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

const REGISTRATION_GUIDE_STEP_KEYS = [
  'email',
  'confirmEmail',
  'phone',
  'password',
  'confirmPassword',
  'birthYear',
  'terms',
  'finish',
] as const;

export default function RegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const route = useRoute<any>();
  const shouldShowGuide = route?.params?.showGuide === true;

  const scrollRef = useRef<ScrollView | null>(null);

  const emailInputRef = useRef<RNTextInput | null>(null);
  const confirmEmailInputRef = useRef<RNTextInput | null>(null);
  const phoneInputRef = useRef<RNTextInput | null>(null);
  const passwordInputRef = useRef<RNTextInput | null>(null);
  const confirmPasswordInputRef = useRef<RNTextInput | null>(null);

  const guideFieldRefs = useRef<Record<number, View | null>>({});

  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [guideVisible, setGuideVisible] = useState(shouldShowGuide);
  const [guideStep, setGuideStep] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [selectedCountry, setSelectedCountry] = useState<CountryPhoneOption>(
    AMERICA_COUNTRIES.find((c) => c.code === 'US') || AMERICA_COUNTRIES[0],
  );
  const [countryModalOpen, setCountryModalOpen] = useState(false);

  // Loading único (evita doble taps)
  const [submitting, setSubmitting] = useState(false);

  // Errores en vivo
  const [emailError, setEmailError] = useState<string | null>(null);
  const [confirmEmailError, setConfirmEmailError] = useState<string | null>(
    null,
  );
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null);

  // Mostrar/ocultar password
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Año de nacimiento (obligatorio)
  const [birthYear, setBirthYear] = useState<number | null>(null);

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // modal wheel
  const [yearOpen, setYearOpen] = useState(false);
  const [tempYear, setTempYear] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 100 }, (_, i) => currentYear - i),
    [currentYear],
  );

  const getInitialYearIndex = () => {
    const fallback = currentYear - 18;
    const targetYear = birthYear ?? tempYear ?? fallback;
    const index = years.indexOf(targetYear);
    return index >= 0 ? index : 0;
  };

  const openYear = () => {
    const fallback = currentYear - 18;
    setTempYear(birthYear ?? fallback);
    setYearOpen(true);
  };

  const yearListRef = useRef<FlatList<number>>(null);

  const confirmYear = () => {
    if (tempYear) setBirthYear(tempYear);
    setYearOpen(false);
  };

  const computedAge = birthYear != null ? currentYear - birthYear : null;
  const ageInvalid = computedAge !== null && computedAge < 14;

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const isStrongPassword = (value: string) => {
    if (value.length < 8) return false;
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);
    return hasLetter && hasNumber;
  };

  const sanitizePhoneNumber = (value: string) => value.replace(/\D/g, '');

  const buildFullPhoneNumber = (
    dialCode: string,
    localPhone: string,
  ): string => {
    const cleanDialCode = dialCode.replace(/\D/g, '');
    const cleanLocalPhone = sanitizePhoneNumber(localPhone);
    return `+${cleanDialCode}${cleanLocalPhone}`;
  };

  const isValidPhone = (fullPhone: string) => {
    if (!fullPhone) return false;
    return /^\+[1-9]\d{7,14}$/.test(fullPhone);
  };

  const guideChecks = useMemo(() => {
    const emailOk = isValidEmail(email);
    const confirmEmailOk =
      emailOk &&
      confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

    const passwordOk = isStrongPassword(password);
    const confirmPasswordOk = passwordOk && confirmPassword === password;

    const birthYearOk = birthYear !== null && currentYear - birthYear >= 14;

    const phoneFull = buildFullPhoneNumber(
      selectedCountry.dialCode,
      sanitizePhoneNumber(phone),
    );
    const phoneOk = isValidPhone(phoneFull);

    return [
      emailOk,
      confirmEmailOk,
      phoneOk,
      passwordOk,
      confirmPasswordOk,
      birthYearOk,
      acceptedTerms,
      emailOk &&
        confirmEmailOk &&
        phoneOk &&
        passwordOk &&
        confirmPasswordOk &&
        birthYearOk &&
        acceptedTerms,
    ];
  }, [
    email,
    confirmEmail,
    phone,
    selectedCountry,
    password,
    confirmPassword,
    birthYear,
    currentYear,
    acceptedTerms,
  ]);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const setGuideFieldRef =
    (step: number) =>
    (ref: View | null): void => {
      guideFieldRefs.current[step] = ref;
    };

  useEffect(() => {
    if (!guideVisible) return;

    const inputRefs: Record<number, React.RefObject<RNTextInput | null>> = {
      0: emailInputRef,
      1: confirmEmailInputRef,
      2: phoneInputRef,
      3: passwordInputRef,
      4: confirmPasswordInputRef,
    };

    const centerStep = () => {
      const target = guideFieldRefs.current[guideStep];

      if (!target || !scrollRef.current) return;

      target.measureLayout(
        scrollRef.current as any,
        (_x, y, _width, height) => {
          const guideCardReservedHeight = 240;
          const bottomReservedHeight =
            keyboardVisible && keyboardHeight > 0
              ? keyboardHeight + 40
              : guideStep >= 3 && guideStep <= 5
                ? 320
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
  }, [guideStep, guideVisible, keyboardVisible, keyboardHeight]);

  const isGuideFieldActive = (step: number) =>
    guideVisible && guideStep === step;

  const guideAllows = (step: number) => !guideVisible || guideStep === step;

  const goNextGuideStep = () => {
    if (!guideChecks[guideStep]) {
      Alert.alert(
        t('authentication.register.guide.completeStepTitle'),
        t('authentication.register.guide.completeStepMessage'),
      );
      return;
    }

    setGuideStep((prev) =>
      Math.min(prev + 1, REGISTRATION_GUIDE_STEP_KEYS.length - 1),
    );
  };

  const goBackGuideStep = () => {
    setGuideStep((prev) => Math.max(prev - 1, 0));
  };

  const skipRegistrationGuide = () => {
    setGuideVisible(false);
    setGuideStep(0);
    Keyboard.dismiss();
  };

  // Handlers con validaciones en vivo
  const handleEmailChange = (value: string) => {
    setEmail(value);

    if (!value.trim()) {
      setEmailError(null);
    } else if (!isValidEmail(value)) {
      setEmailError(t('validation.invalidEmail'));
    } else {
      setEmailError(null);
    }

    if (confirmEmail.trim()) {
      if (value.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
        setConfirmEmailError(t('validation.emailMismatch'));
      } else {
        setConfirmEmailError(null);
      }
    }
  };

  const handleConfirmEmailChange = (value: string) => {
    setConfirmEmail(value);

    if (!value.trim()) {
      setConfirmEmailError(null);
      return;
    }

    if (value.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setConfirmEmailError(t('validation.emailMismatch'));
    } else {
      setConfirmEmailError(null);
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);

    if (!value) {
      setPasswordError(null);
    } else if (!isStrongPassword(value)) {
      setPasswordError(t('validation.strongPasswordRequired'));
    } else {
      setPasswordError(null);
    }

    if (confirmPassword) {
      if (confirmPassword !== value) {
        setConfirmPasswordError(t('validation.passwordMismatch'));
      } else {
        setConfirmPasswordError(null);
      }
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);

    if (!value) {
      setConfirmPasswordError(null);
      return;
    }

    if (value !== password) {
      setConfirmPasswordError(t('validation.passwordMismatch'));
    } else {
      setConfirmPasswordError(null);
    }
  };

  const handleRegister = async () => {
    if (submitting) return;

    if (birthYear === null) {
      Alert.alert(
        t('authentication.register.alerts.birthYearRequiredTitle'),
        t('authentication.register.alerts.birthYearRequiredMessage'),
      );
      return;
    }

    if (currentYear - birthYear < 14) {
      Alert.alert(
        t('authentication.register.alerts.minimumAgeTitle'),
        t('authentication.register.alerts.minimumAgeMessage'),
      );
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert(
        t('authentication.register.alerts.invalidEmailTitle'),
        t('authentication.register.alerts.invalidEmailMessage'),
      );
      return;
    }

    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      Alert.alert(
        t('authentication.register.alerts.emailMismatchTitle'),
        t('authentication.register.alerts.emailMismatchMessage'),
      );
      return;
    }

    const localPhone = sanitizePhoneNumber(phone);
    const normalizedPhone = localPhone
      ? buildFullPhoneNumber(selectedCountry.dialCode, localPhone)
      : '';

    if (normalizedPhone && !isValidPhone(normalizedPhone)) {
      Alert.alert(
        t('authentication.register.alerts.invalidPhoneTitle'),
        t('authentication.register.alerts.invalidPhoneMessage'),
      );
      return;
    }

    if (!isStrongPassword(password)) {
      Alert.alert(
        t('authentication.register.alerts.weakPasswordTitle'),
        t('authentication.register.alerts.weakPasswordMessage'),
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        t('authentication.register.alerts.passwordMismatchTitle'),
        t('authentication.register.alerts.passwordMismatchMessage'),
      );
      return;
    }

    if (!acceptedTerms) {
      Alert.alert(
        t('authentication.register.alerts.termsRequiredTitle'),
        t('authentication.register.alerts.termsRequiredMessage'),
      );
      return;
    }

    try {
      setSubmitting(true);

      const { user } = await registerWithEmail(email.trim(), password);

      const profile: CreateProfilePayload = {
        email: email.trim(),
        birthYear,
        phone: normalizedPhone || null,
        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),

        // ✅ ya no dependemos de SMS
        phoneVerified: true,
        phoneVerifiedAt: null,
      };

      await createUserProfile(user.uid, profile as any);

      if (Platform.OS === 'android') {
        setGuideVisible(false);
        Keyboard.dismiss();
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'CompleteProfile',
              params: {
                uid: user.uid,
                email: user.email ?? email.trim(),
                inputNonce: Date.now(),
              },
            },
          ],
        });
        return;
      }

      try {
        await firebaseAuth.signOut();
      } catch {}

      setGuideVisible(false);

      Alert.alert(
        t('authentication.register.alerts.accountCreatedTitle'),
        t('authentication.register.alerts.accountCreatedMessage'),
        [
          {
            text: t('common.buttons.ok'),
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            },
          },
        ],
      );
    } catch (e: any) {
      const msg = getAuthErrorMessage(e?.code);
      Alert.alert(t('authentication.register.alerts.errorTitle'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  function getAuthErrorMessage(code?: string) {
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return t('authentication.errors.invalidEmail');

      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return t('authentication.errors.invalidCredential');

      case 'auth/weak-password':
        return t('authentication.errors.weakPasswordRegister');

      case 'auth/email-already-in-use':
        return t('authentication.errors.emailAlreadyInUse');

      case 'auth/network-request-failed':
        return t('authentication.errors.networkRequestFailed');

      case 'auth/too-many-requests':
        return t('authentication.errors.tooManyRequests');

      case 'auth/operation-not-allowed':
        return t('authentication.errors.operationNotAllowedSignUp');

      default:
        return t('authentication.errors.generic');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: insets.top + (guideVisible ? 220 : 20),
              paddingBottom:
                insets.bottom + (keyboardVisible ? keyboardHeight + 40 : 40),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ref={scrollRef}
        >
          <Text style={styles.title}>
            {t('authentication.register.title')}
          </Text>

          {/* Email */}
          <View
            ref={setGuideFieldRef(0)}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(0) &&
                styles.guideInactiveField,
              isGuideFieldActive(0) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>
              {t('authentication.register.emailLabel')}
            </Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={t('authentication.register.emailPlaceholder')}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={handleEmailChange}
                secureTextEntry={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                ref={emailInputRef}
                editable={guideAllows(0)}
              />
            </View>
            {emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>

          {/* Confirm Email */}
          <View
            ref={setGuideFieldRef(1)}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(1) &&
                styles.guideInactiveField,
              isGuideFieldActive(1) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>
              {t('authentication.register.confirmEmailLabel')}
            </Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={t(
                  'authentication.register.confirmEmailPlaceholder',
                )}
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                keyboardType="email-address"
                value={confirmEmail}
                onChangeText={handleConfirmEmailChange}
                secureTextEntry={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                ref={confirmEmailInputRef}
                editable={guideAllows(1)}
              />
            </View>
            {confirmEmailError && (
              <Text style={styles.errorText}>{confirmEmailError}</Text>
            )}
          </View>

          {/* Phone */}
          <View
            ref={setGuideFieldRef(2)}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(2) &&
                styles.guideInactiveField,
              isGuideFieldActive(2) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>
              {t('authentication.register.phoneLabel')}
            </Text>

            <View style={styles.phoneContainer}>
              <TouchableOpacity
                style={styles.countrySelector}
                activeOpacity={0.8}
                onPress={() => {
                  if (!guideAllows(2)) return;
                  setCountryModalOpen(true);
                }}
                disabled={!guideAllows(2)}
              >
                <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                <Text style={styles.countryDialCode}>
                  {selectedCountry.dialCode}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#475569" />
              </TouchableOpacity>

              <View style={styles.phoneInputContainer}>
                <Ionicons
                  name="call"
                  size={20}
                  color="#999"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t('authentication.register.phonePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(value) =>
                    setPhone(value.replace(/[^\d]/g, ''))
                  }
                  secureTextEntry={false}
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  ref={phoneInputRef}
                  editable={guideAllows(2)}
                />
              </View>
            </View>

            <Text style={styles.helperText}>
              {t('authentication.register.phoneHelper')}
            </Text>
          </View>

          {/* Password */}
          <View
            ref={setGuideFieldRef(3)}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(3) &&
                styles.guideInactiveField,
              isGuideFieldActive(3) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>
              {t('authentication.register.passwordLabel')}
            </Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={t('authentication.register.passwordPlaceholder')}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={handlePasswordChange}
                ref={passwordInputRef}
                editable={guideAllows(3)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#777"
                />
              </TouchableOpacity>
            </View>
            {passwordError && (
              <Text style={styles.errorText}>{passwordError}</Text>
            )}
          </View>

          {/* Confirm Password */}
          <View
            ref={setGuideFieldRef(4)}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(4) &&
                styles.guideInactiveField,
              isGuideFieldActive(4) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>
              {t('authentication.register.confirmPasswordLabel')}
            </Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={t(
                  'authentication.register.confirmPasswordPlaceholder',
                )}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                ref={confirmPasswordInputRef}
                editable={guideAllows(4)}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#777"
                />
              </TouchableOpacity>
            </View>
            {confirmPasswordError && (
              <Text style={styles.errorText}>{confirmPasswordError}</Text>
            )}
          </View>

          {/* Birth year */}
          <View
            ref={setGuideFieldRef(5)}
            style={[
              styles.fieldGroup,
              styles.ageRow,
              guideVisible &&
                !isGuideFieldActive(5) &&
                styles.guideInactiveField,
              isGuideFieldActive(5) && styles.guideActiveField,
            ]}
          >
            <View style={styles.labelRow}>
              <Ionicons name="calendar" size={18} color="#999" />
              <Text style={styles.fieldLabel}>
                {t('authentication.register.birthYearLabel')}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.selector, ageInvalid && styles.selectorError]}
              activeOpacity={0.8}
              onPress={() => {
                if (!guideAllows(5)) return;
                openYear();
              }}
              disabled={!guideAllows(5)}
            >
              <Text style={styles.selectorText}>
                {birthYear === null
                  ? t('authentication.register.birthYearSelect')
                  : String(birthYear)}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#475569" />
            </TouchableOpacity>

            {ageInvalid && (
              <Text style={styles.ageHelper}>
                {t('authentication.register.ageHelper')}
              </Text>
            )}
          </View>

          {/* Terms and Conditions */}
          <View
            ref={setGuideFieldRef(6)}
            style={[
              styles.termsRow,
              guideVisible &&
                !isGuideFieldActive(6) &&
                styles.guideInactiveField,
              isGuideFieldActive(6) && styles.guideActiveField,
            ]}
          >
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => {
                if (!guideAllows(6)) return;
                setAcceptedTerms((prev) => !prev);
              }}
              disabled={!guideAllows(6)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={acceptedTerms ? 'checkbox' : 'square-outline'}
                size={22}
                color="#3B5A85"
              />
            </TouchableOpacity>

            <Text style={styles.termsText}>
              {t('authentication.register.termsPrefix')}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL('https://nearsy.app/legal')}
              >
                {t('authentication.register.termsLink')}
              </Text>
              {t('authentication.register.termsSuffix')}
            </Text>
          </View>

          <View ref={setGuideFieldRef(7)}>
            <TouchableOpacity
              style={[
                styles.button,
                submitting && { opacity: 0.7 },
                isGuideFieldActive(7) && styles.guideActiveButton,
              ]}
              onPress={handleRegister}
              disabled={submitting || (guideVisible && !guideAllows(7))}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#1A2B3C" />
              ) : (
                <Text style={styles.buttonText}>
                  {t('authentication.register.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {ENABLE_SOCIAL_LOGIN ? null : null}

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>
              {t('authentication.register.alreadyHaveAccount')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {guideVisible && (
        <Animated.View
          entering={FadeInDown.duration(350)}
          style={[styles.floatingGuideCard, { top: insets.top + 10 }]}
        >
          <View style={styles.guideHeader}>
            <View style={styles.guideBadge}>
              <Text style={styles.guideBadgeText}>
                {t('authentication.register.guide.stepProgress', {
                  current: guideStep + 1,
                  total: REGISTRATION_GUIDE_STEP_KEYS.length,
                })}
              </Text>
            </View>

            <TouchableOpacity onPress={skipRegistrationGuide}>
              <Text style={styles.guideSkip}>
                {t('authentication.register.guide.skip')}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.guideTitle}>
            {t(
              `authentication.register.guide.steps.${REGISTRATION_GUIDE_STEP_KEYS[guideStep]}.title`,
            )}
          </Text>

          <Text style={styles.guideDescription}>
            {t(
              `authentication.register.guide.steps.${REGISTRATION_GUIDE_STEP_KEYS[guideStep]}.description`,
            )}
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
              <Text style={styles.guideNavButtonText}>
                {t('common.actions.back')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.guideNavButtonPrimary}
              onPress={
                guideStep === REGISTRATION_GUIDE_STEP_KEYS.length - 1
                  ? () => {
                      if (!guideChecks[guideStep]) {
                        Alert.alert(
                          t(
                            'authentication.register.guide.completeStepTitle',
                          ),
                          t(
                            'authentication.register.guide.completeStepMessage',
                          ),
                        );
                        return;
                      }
                      skipRegistrationGuide();
                    }
                  : goNextGuideStep
              }
              activeOpacity={0.85}
            >
              <Text style={styles.guideNavButtonPrimaryText}>
                {guideStep === REGISTRATION_GUIDE_STEP_KEYS.length - 1
                  ? t('authentication.register.guide.gotIt')
                  : t('common.actions.next')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Birth year modal */}
      <Modal
        visible={yearOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setYearOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (tempYear) setBirthYear(tempYear);
            setYearOpen(false);
          }}
        >
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('authentication.register.birthYearModalTitle')}
            </Text>

            <FlatList
              ref={yearListRef}
              data={years}
              keyExtractor={(item) => String(item)}
              style={{ width: '100%', maxHeight: 250 }}
              contentContainerStyle={{ paddingVertical: 6 }}
              showsVerticalScrollIndicator={false}
              initialScrollIndex={getInitialYearIndex()}
              getItemLayout={(_, index) => ({
                length: 52,
                offset: 52 * index,
                index,
              })}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  yearListRef.current?.scrollToIndex({
                    index: info.index,
                    animated: true,
                    viewPosition: 0.5,
                  });
                }, 100);
              }}
              renderItem={({ item }) => {
                const isSelected = item === birthYear;

                return (
                  <TouchableOpacity
                    style={[
                      styles.yearOption,
                      isSelected && styles.yearOptionSelected,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setBirthYear(item);
                      setYearOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.yearText,
                        isSelected && styles.yearTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Country modal */}
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
            <Text style={styles.modalTitle}>
              {t('authentication.register.countryModalTitle')}
            </Text>

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
                        <Text style={styles.countryOptionDialCodeSmall}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#2B3A42',
  },

  fieldGroup: {
    width: '100%',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 4,
    fontWeight: '500',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
    borderRadius: 30,
    paddingHorizontal: 15,
    marginVertical: 2,
    width: '100%',
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 45,
    fontSize: 16,
    color: '#333',
  },
  eyeButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  errorText: {
    width: '100%',
    color: '#EF4444',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  helperText: {
    width: '100%',
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 4,
  },

  ageRow: {
    width: '100%',
    marginTop: 6,
    marginBottom: 10,
  },
  selector: {
    width: '100%',
    height: 45,
    paddingHorizontal: 15,
    borderRadius: 30,
    backgroundColor: '#F1F1F1',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  selectorText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '500',
  },
  ageHelper: {
    color: '#EF4444',
    marginTop: 4,
    marginBottom: 6,
    fontSize: 12,
  },

  termsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    marginRight: 8,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#4B5563',
  },
  termsLink: {
    textDecorationLine: 'underline',
    color: '#3B5A85',
    fontWeight: '600',
  },

  button: {
    backgroundColor: '#ADCBE3',
    paddingVertical: 12,
    paddingHorizontal: 60,
    borderRadius: 20,
    marginTop: 20,
    minWidth: 180,
    alignItems: 'center',
  },
  buttonText: {
    color: '#1A2B3C',
    fontSize: 16,
    fontWeight: 'bold',
  },

  link: {
    marginTop: 20,
    fontSize: 14,
    color: '#555',
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
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  wheelItem: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  modalBtnSecondaryText: {
    color: '#111827',
    fontWeight: '600',
  },
  modalBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ADCBE3',
  },
  modalBtnPrimaryText: {
    color: '#1A2B3C',
    fontWeight: '700',
  },

  phoneContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countrySelector: {
    height: 45,
    minWidth: 110,
    paddingHorizontal: 12,
    borderRadius: 30,
    backgroundColor: '#F1F1F1',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  phoneInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
    borderRadius: 30,
    paddingHorizontal: 15,
    marginVertical: 2,
  },

  countryModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
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
    flex: 1,
    paddingRight: 8,
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
  countryOptionDialCodeSmall: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },

  yearOption: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },

  yearOptionSelected: {
    backgroundColor: '#EEF4FA',
  },

  yearText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },

  yearTextSelected: {
    color: '#3B5A85',
    fontWeight: '800',
  },

  guideCard: {
    width: '100%',
    backgroundColor: '#EEF4FA',
    borderRadius: 18,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ADCBE3',
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
  guideActiveButton: {
    borderWidth: 2,
    borderColor: '#3B5A85',
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

  guideInactiveField: {
    opacity: 0.45,
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
});
