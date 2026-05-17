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
  KeyboardAvoidingView,
  ScrollView,
  TextInput as RNTextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { firebaseAuth } from '../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

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

const REGISTRATION_GUIDE_STEPS = [
  {
    title: 'Start with your email',
    description: 'Enter the email address you want to use for Nearsy.',
  },
  {
    title: 'Confirm your email',
    description: 'Type your email again to make sure there are no mistakes.',
  },
  {
    title: 'Add your phone number',
    description: 'Select your country code and enter your mobile number.',
  },
  {
    title: 'Create a secure password',
    description: 'Use at least 8 characters, including letters and numbers.',
  },
  {
    title: 'Confirm your password',
    description: 'Type the same password again.',
  },
  {
    title: 'Select your birth year',
    description: 'This helps us confirm you meet the minimum age requirement.',
  },
  {
    title: 'Accept the terms',
    description: 'Review and accept the terms to create your account.',
  },
  {
    title: 'Finish registration',
    description: 'Tap Register and then verify your email.',
  },
];

export default function RegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const route = useRoute<any>();
  const shouldShowGuide = route?.params?.showGuide === true;

  const scrollRef = useRef<ScrollView | null>(null);

  const emailInputRef = useRef<RNTextInput | null>(null);
  const confirmEmailInputRef = useRef<RNTextInput | null>(null);
  const phoneInputRef = useRef<RNTextInput | null>(null);
  const passwordInputRef = useRef<RNTextInput | null>(null);
  const confirmPasswordInputRef = useRef<RNTextInput | null>(null);

  const stepYPositions = useRef<Record<number, number>>({});

  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [guideVisible, setGuideVisible] = useState(shouldShowGuide);
  const [guideStep, setGuideStep] = useState(0);

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

    return [
      emailOk,
      confirmEmailOk,
      isValidPhone(
        buildFullPhoneNumber(
          selectedCountry.dialCode,
          sanitizePhoneNumber(phone),
        ),
      ),
      passwordOk,
      confirmPasswordOk,
      birthYearOk,
      acceptedTerms,
      false,
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
    if (!guideVisible) return;

    const isCurrentStepComplete = guideChecks[guideStep];

    if (!isCurrentStepComplete) return;
    if (guideStep >= REGISTRATION_GUIDE_STEPS.length - 1) return;

    const timeout = setTimeout(() => {
      setGuideStep((prev) =>
        Math.min(prev + 1, REGISTRATION_GUIDE_STEPS.length - 1),
      );
    }, 450);

    return () => clearTimeout(timeout);
  }, [guideVisible, guideStep, guideChecks]);

  useEffect(() => {
    if (!guideVisible) return;

    const y = stepYPositions.current[guideStep];

    const timeout = setTimeout(() => {
      if (typeof y === 'number') {
        scrollRef.current?.scrollTo({
          y: Math.max(y - 220, 0),
          animated: true,
        });
      }

      const inputRefs: Record<number, React.RefObject<RNTextInput | null>> = {
        0: emailInputRef,
        1: confirmEmailInputRef,
        2: phoneInputRef,
        3: passwordInputRef,
        4: confirmPasswordInputRef,
      };

      inputRefs[guideStep]?.current?.focus();
    }, 220);

    return () => clearTimeout(timeout);
  }, [guideStep, guideVisible]);

  const isGuideFieldActive = (step: number) =>
    guideVisible && guideStep === step;

  // Handlers con validaciones en vivo
  const handleEmailChange = (value: string) => {
    setEmail(value);

    if (!value.trim()) {
      setEmailError(null);
    } else if (!isValidEmail(value)) {
      setEmailError('Please enter a valid email address.');
    } else {
      setEmailError(null);
    }

    if (confirmEmail.trim()) {
      if (value.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
        setConfirmEmailError('Email and confirmation email must match.');
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
      setConfirmEmailError('Email and confirmation email must match.');
    } else {
      setConfirmEmailError(null);
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);

    if (!value) {
      setPasswordError(null);
    } else if (!isStrongPassword(value)) {
      setPasswordError(
        'Password must be at least 8 characters and include letters and numbers.',
      );
    } else {
      setPasswordError(null);
    }

    if (confirmPassword) {
      if (confirmPassword !== value) {
        setConfirmPasswordError('Password and confirmation must match.');
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
      setConfirmPasswordError('Password and confirmation must match.');
    } else {
      setConfirmPasswordError(null);
    }
  };

  const handleRegister = async () => {
    if (submitting) return;

    if (birthYear === null) {
      Alert.alert('Birth year required', 'Please select your birth year.');
      return;
    }

    if (currentYear - birthYear < 14) {
      Alert.alert('Minimum age', 'You must be 14+ to create an account.');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      Alert.alert('Email mismatch', 'Email and confirmation email must match.');
      return;
    }

    const localPhone = sanitizePhoneNumber(phone);
    const normalizedPhone = localPhone
      ? buildFullPhoneNumber(selectedCountry.dialCode, localPhone)
      : '';

    if (!isValidPhone(normalizedPhone)) {
      Alert.alert(
        'Invalid phone number',
        'If you provide a phone number, please select your country code and enter a valid mobile number.',
      );
      return;
    }

    if (!isStrongPassword(password)) {
      Alert.alert(
        'Weak password',
        'Password must be at least 8 characters long and include letters and numbers.',
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        'Password mismatch',
        'Password and confirmation password must match.',
      );
      return;
    }

    if (!acceptedTerms) {
      Alert.alert(
        'Terms required',
        'You must accept the terms and conditions to create an account.',
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

      try {
        await firebaseAuth.signOut();
      } catch {}

      Alert.alert(
        'Verify your email',
        'We sent a verification link to your email. Please verify your account before logging in on this device. If you don’t see the email, please check your Spam or Junk folder.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.replace('Login');
            },
          },
        ],
      );
    } catch (e: any) {
      const msg = getAuthErrorMessage(e?.code);
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  function getAuthErrorMessage(code?: string) {
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return 'Please enter a valid email address.';

      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password.';

      case 'auth/weak-password':
        return 'Password is too weak. Please use a stronger password.';

      case 'auth/email-already-in-use':
        return 'This email is already registered. Try logging in.';

      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';

      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';

      case 'auth/operation-not-allowed':
        return 'Email/password sign-up is disabled for this project.';

      default:
        return 'Something went wrong. Please try again.';
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
              paddingTop: insets.top + (guideVisible ? 170 : 20),
              paddingBottom: insets.bottom + 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ref={scrollRef}
        >
          <Text style={styles.title}>Create Account</Text>

          {/* Email */}
          <View
            onLayout={(event) => {
              stepYPositions.current[0] = event.nativeEvent.layout.y;
            }}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(0) &&
                styles.guideInactiveField,
              isGuideFieldActive(0) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
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
              />
            </View>
            {emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>

          {/* Confirm Email */}
          <View
            onLayout={(event) => {
              stepYPositions.current[1] = event.nativeEvent.layout.y;
            }}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(1) &&
                styles.guideInactiveField,
              isGuideFieldActive(1) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>Confirm Email</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm Email"
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
              />
            </View>
            {confirmEmailError && (
              <Text style={styles.errorText}>{confirmEmailError}</Text>
            )}
          </View>

          {/* Phone */}
          <View
            onLayout={(event) => {
              stepYPositions.current[2] = event.nativeEvent.layout.y;
            }}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(2) &&
                styles.guideInactiveField,
              isGuideFieldActive(2) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>Phone number</Text>

            <View style={styles.phoneContainer}>
              <TouchableOpacity
                style={styles.countrySelector}
                activeOpacity={0.8}
                onPress={() => setCountryModalOpen(true)}
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
                  placeholder={
                    Platform.OS === 'android' ? 'Phone number' : 'Phone number'
                  }
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
                />
              </View>
            </View>

            <Text style={styles.helperText}>
              Select your country and enter a valid mobile number.
            </Text>
          </View>

          {/* Password */}
          <View
            onLayout={(event) => {
              stepYPositions.current[3] = event.nativeEvent.layout.y;
            }}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(3) &&
                styles.guideInactiveField,
              isGuideFieldActive(3) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={handlePasswordChange}
                ref={passwordInputRef}
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
            onLayout={(event) => {
              stepYPositions.current[4] = event.nativeEvent.layout.y;
            }}
            style={[
              styles.fieldGroup,
              guideVisible &&
                !isGuideFieldActive(4) &&
                styles.guideInactiveField,
              isGuideFieldActive(4) && styles.guideActiveField,
            ]}
          >
            <Text style={styles.fieldLabel}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                ref={confirmPasswordInputRef}
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
            onLayout={(event) => {
              stepYPositions.current[5] = event.nativeEvent.layout.y;
            }}
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
              <Text style={styles.fieldLabel}>Birth year *</Text>
            </View>

            <TouchableOpacity
              style={[styles.selector, ageInvalid && styles.selectorError]}
              activeOpacity={0.8}
              onPress={openYear}
            >
              <Text style={styles.selectorText}>
                {birthYear === null ? 'Select' : String(birthYear)}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#475569" />
            </TouchableOpacity>

            {ageInvalid && (
              <Text style={styles.ageHelper}>You must be 14+ to register.</Text>
            )}
          </View>

          {/* Terms and Conditions */}
          <View
            onLayout={(event) => {
              stepYPositions.current[6] = event.nativeEvent.layout.y;
            }}
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
              onPress={() => setAcceptedTerms((prev) => !prev)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={acceptedTerms ? 'checkbox' : 'square-outline'}
                size={22}
                color="#3B5A85"
              />
            </TouchableOpacity>

            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL('https://nearsy.app/legal')}
              >
                terms and conditions
              </Text>
              .
            </Text>
          </View>

          <View
            onLayout={(event) => {
              stepYPositions.current[7] = event.nativeEvent.layout.y;
            }}
          >
            <TouchableOpacity
              style={[
                styles.button,
                submitting && { opacity: 0.7 },
                isGuideFieldActive(7) && styles.guideActiveButton,
              ]}
              onPress={handleRegister}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#1A2B3C" />
              ) : (
                <Text style={styles.buttonText}>Register</Text>
              )}
            </TouchableOpacity>
          </View>
          {ENABLE_SOCIAL_LOGIN ? null : null}

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Already have an account? Log In</Text>
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
                {guideStep + 1}/{REGISTRATION_GUIDE_STEPS.length}
              </Text>
            </View>

            <TouchableOpacity onPress={() => setGuideVisible(false)}>
              <Text style={styles.guideSkip}>Skip guide</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.guideTitle}>
            {REGISTRATION_GUIDE_STEPS[guideStep].title}
          </Text>

          <Text style={styles.guideDescription}>
            {REGISTRATION_GUIDE_STEPS[guideStep].description}
          </Text>
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
            <Text style={styles.modalTitle}>Select your birth year</Text>

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
  guideNextButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#3B5A85',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  guideNextText: {
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
