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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { registerWithEmail } from '../services/authService';
import { useGoogleAuth } from '../services/googleAuth';
import { createUserProfile } from '../services/firestoreService';
import WheelPicker from 'react-native-wheel-picker-expo';
import { signInWithApple } from '../services/appleAuth';

// 🔒 Feature flag para social login (igual que en LoginScreen)
const ENABLE_SOCIAL_LOGIN =
  process.env.EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN === 'true';

export default function RegisterScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

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

  const { signInWithGoogle, request } = useGoogleAuth();

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

  const isValidPhone = (value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return false;
    // Formato simple: dígitos, espacios, guiones y opcional "+"
    return /^[0-9+\-\s()]{7,}$/.test(cleaned);
  };

  // Handlers con validaciones en vivo
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (!value.trim()) {
      setEmailError(null);
      return;
    }
    if (!isValidEmail(value)) {
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
      return;
    }
    if (!isStrongPassword(value)) {
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

    // Phone required
    if (!isValidPhone(phone)) {
      Alert.alert('Invalid phone number', 'Please enter a valid phone number.');
      return;
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
      const { user } = await registerWithEmail(email.trim(), password);

      const profile: any = {
        email: email.trim(),
        birthYear,
        phone: phone.trim(),
        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),
      };

      await createUserProfile(user.uid, profile);

      Alert.alert(
        'Registration successful 🎉',
        'We have sent you a verification email. Please check your inbox and then log in with your account.',
      );

      // → Después de registrarse lo mandamos a Login
      navigation.navigate('Login');
    } catch (e: any) {
      const msg = getAuthErrorMessage(e?.code);
      Alert.alert('Error', msg);
    }
  };

  const handleGoogle = async () => {
    if (!ENABLE_SOCIAL_LOGIN) return;

    try {
      const user = await signInWithGoogle();

      const profile: any = {
        email: email.trim() || user.email,
        birthYear,
        acceptedTerms: true,
        acceptedTermsAt: new Date().toISOString(),
      };
      if (phone.trim()) profile.phone = phone.trim();

      await createUserProfile(user.uid, profile);
      navigation.navigate('CompleteProfile', {
        uid: user.uid,
        email: user.email,
      });
    } catch (e: any) {
      Alert.alert(
        'Google Sign-in',
        e?.message ?? 'Failed to sign in with Google',
      );
    }
  };

  const handleApple = async () => {
    if (!ENABLE_SOCIAL_LOGIN) return;

    Alert.alert(
      'Sign in with Apple',
      Platform.OS === 'ios' ? 'Coming soon.' : 'Coming soon.',
    );
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
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
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

      {/* Phone (required) */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Phone number</Text>
        <View style={styles.inputContainer}>
          <Ionicons
            name="call"
            size={20}
            color="#999"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        </View>
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
        {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
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

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Register</Text>
      </TouchableOpacity>

      {/* ---------- OR + SOCIAL SOLO SI SE HABILITA ---------- */}
      {ENABLE_SOCIAL_LOGIN && (
        <>
          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>or</Text>
            <View style={styles.separatorLine} />
          </View>

          <View style={styles.socialGroup}>
            <TouchableOpacity
              style={[styles.socialBtn, styles.googleBtn]}
              onPress={handleGoogle}
              disabled={!request}
              activeOpacity={0.85}
            >
              <Ionicons
                name="logo-google"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.socialTextLight}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialBtn, styles.appleBtn]}
              onPress={handleApple}
              activeOpacity={0.85}
            >
              <Ionicons
                name="logo-apple"
                size={20}
                color="#000"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.socialTextDark}>Continue with Apple</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Already have an account? Log In</Text>
      </TouchableOpacity>

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
    flex: 1,
    justifyContent: 'center',
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

  // ✅ NUEVOS
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

  // ⬇️ Birth year ahora full width como los inputs
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
  },
  buttonText: { color: '#1A2B3C', fontSize: 16, fontWeight: 'bold' },
  separatorRow: {
    width: '100%',
    marginTop: 22,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  separatorText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  socialGroup: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  socialBtn: {
    width: '100%',
    height: 46,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtn: {
    backgroundColor: '#1F2937',
  },
  appleBtn: {
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  socialTextLight: { color: '#fff', fontWeight: '700' },
  socialTextDark: { color: '#111', fontWeight: '700' },
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
