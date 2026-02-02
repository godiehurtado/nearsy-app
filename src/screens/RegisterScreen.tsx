// RegisterScreen.tsx
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ActivityIndicator,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import WheelPicker from 'react-native-wheel-picker-expo';

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

export default function RegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

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

  const openYear = () => {
    const fallback = currentYear - 18;
    setTempYear(birthYear ?? fallback);
    setYearOpen(true);
  };
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

  // ✅ Validador E.164 (teléfono internacional con código de país)
  const isValidPhone = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    if (!cleaned) return false;
    return /^\+[1-9]\d{7,14}$/.test(cleaned);
  };

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

    // Revalidar confirmEmail si ya tiene algo
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

    // Revalidar confirmPassword si ya tiene algo
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

    // Birth year
    if (birthYear === null) {
      Alert.alert('Birth year required', 'Please select your birth year.');
      return;
    }
    if (currentYear - birthYear < 14) {
      Alert.alert('Minimum age', 'You must be 14+ to create an account.');
      return;
    }

    // Email & confirm email
    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      Alert.alert('Email mismatch', 'Email and confirmation email must match.');
      return;
    }

    // 📱 Phone: obligatorio en Android, opcional en iOS
    const normalizedPhone = phone.replace(/\s/g, '');

    if (Platform.OS === 'android') {
      if (!isValidPhone(normalizedPhone)) {
        Alert.alert(
          'Phone required',
          'Please enter a valid phone number with country code, e.g. +1 305 123 4567 or +57 300 123 4567. This is required on Android to verify your account by SMS.',
        );
        return;
      }
    } else {
      if (normalizedPhone && !isValidPhone(normalizedPhone)) {
        Alert.alert(
          'Invalid phone number',
          'If you provide a phone number, it must include the country code, e.g. +1 305 123 4567 or +57 300 123 4567.',
        );
        return;
      }
    }

    // Password & confirm password
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

    // Terms and conditions
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

      // ⚠️ createUserProfile en tu BONUS requiere birthYear number (no null)
      const profile: CreateProfilePayload = {
        email: email.trim(),
        birthYear,
        phone: normalizedPhone || null,

        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),

        phoneVerified: false,
        phoneVerifiedAt: null,
      };

      await createUserProfile(user.uid, profile as any);

      // 🔹 iOS: verificación por correo obligatorio
      // Nota: registerWithEmail ya envía el email de verificación.
      if (Platform.OS === 'ios') {
        Alert.alert(
          'Verify your email',
          'We sent a verification link to your email. Please verify your account before logging in on this device.',
          [
            {
              text: 'OK',
              onPress: async () => {
                try {
                  await auth().signOut();
                } catch {}
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              },
            },
          ],
        );
        return;
      }

      // 🔹 ANDROID: flujo actual con SMS
      Alert.alert(
        'Registration successful 🎉',
        'We will now verify your phone number with a text message.',
      );

      navigation.navigate('PhoneVerification', {
        uid: user.uid,
        phone: normalizedPhone,
      });
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
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Create Account</Text>

          {/* Email */}
          <View style={styles.fieldGroup}>
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
              />
            </View>
            {emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>

          {/* Confirm Email */}
          <View style={styles.fieldGroup}>
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
              />
            </View>
            {confirmEmailError && (
              <Text style={styles.errorText}>{confirmEmailError}</Text>
            )}
          </View>

          {/* Phone (required on Android / optional on iOS) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Phone number {Platform.OS === 'android' ? '*' : '(optional)'}
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="call"
                size={20}
                color="#999"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={
                  Platform.OS === 'android'
                    ? 'Phone number (required, e.g. +1 305 123 4567)'
                    : 'Phone number (optional)'
                }
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {Platform.OS === 'android' ? (
              <Text style={styles.helperText}>
                Required to verify your account via SMS. Include your country
                code (e.g. +1 or +57).
              </Text>
            ) : (
              <Text style={styles.helperText}>
                Optional. If provided, include your country code (e.g. +1 or
                +57).
              </Text>
            )}
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
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
          <View style={styles.fieldGroup}>
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
          <View style={[styles.fieldGroup, styles.ageRow]}>
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
          <View style={styles.termsRow}>
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

          <TouchableOpacity
            style={[styles.button, submitting && { opacity: 0.7 }]}
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

          {/* Social login hidden for this version */}
          {ENABLE_SOCIAL_LOGIN ? null : null}

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Already have an account? Log In</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL WHEEL PICKER */}
      <Modal
        visible={yearOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setYearOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setYearOpen(false)}
        >
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select your birth year</Text>

            <WheelPicker
              height={200}
              width={Platform.OS === 'ios' ? 160 : 180}
              initialSelectedIndex={years.indexOf(tempYear ?? currentYear - 18)}
              onChange={({ index }) => setTempYear(years[index])}
              items={years.map((y) => ({ label: String(y), value: y }))}
              renderItem={({ label }) => (
                <Text style={styles.wheelItem}>{label}</Text>
              )}
              backgroundColor="transparent"
              flatListProps={{ showsVerticalScrollIndicator: false }}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => setYearOpen(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={confirmYear}
              >
                <Text style={styles.modalBtnPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
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
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 45, fontSize: 16, color: '#333' },
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
  selectorError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  selectorText: { color: '#111827', fontSize: 16, fontWeight: '500' },
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
  buttonText: { color: '#1A2B3C', fontSize: 16, fontWeight: 'bold' },

  link: { marginTop: 20, fontSize: 14, color: '#555' },

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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  modalBtnSecondaryText: { color: '#111827', fontWeight: '600' },
  modalBtnPrimary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ADCBE3',
  },
  modalBtnPrimaryText: { color: '#1A2B3C', fontWeight: '700' },
});
