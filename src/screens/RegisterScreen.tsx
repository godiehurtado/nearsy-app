// src/screens/RegisterScreen.tsx
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { registerWithEmail } from '../services/authService';
import { createUserProfile } from '../services/firestoreService';
import WheelPicker from 'react-native-wheel-picker-expo';

export default function RegisterScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const insets = useSafeAreaInsets();

  // opcional
  const [phone, setPhone] = useState('');

  // Año de nacimiento (OBLIGATORIO)
  const [birthYear, setBirthYear] = useState<number | null>(null);

  // modal wheel
  const [yearOpen, setYearOpen] = useState(false);
  const [tempYear, setTempYear] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();
  const years = useMemo(
    // últimos 100 años (ajusta si quieres más)
    () => Array.from({ length: 100 }, (_, i) => currentYear - i),
    [currentYear],
  );

  const openYear = () => {
    // por defecto 18 años
    const fallback = currentYear - 18;
    setTempYear(birthYear ?? fallback);
    setYearOpen(true);
  };
  const confirmYear = () => {
    if (tempYear) setBirthYear(tempYear);
    setYearOpen(false);
  };

  const computedAge = birthYear != null ? currentYear - birthYear : null;

  const handleRegister = async () => {
    if (birthYear === null) {
      Alert.alert('Birth year required', 'Please select your birth year.');
      return;
    }
    if (currentYear - birthYear < 14) {
      Alert.alert('Minimum age', 'You must be 14+ to create an account.');
      return;
    }

    // ✅ Validaciones locales antes de Firebase
    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    try {
      const { user } = await registerWithEmail(email.trim(), password);

      const profile: any = { email: email.trim(), birthYear };
      if (phone.trim()) profile.phone = phone.trim();
      await createUserProfile(user.uid, profile);

      Alert.alert('Registration successful 🎉', 'You can now log in.');
      navigation.navigate('CompleteProfile', {
        uid: user.uid,
        email: user.email,
      });
    } catch (e: any) {
      // ✅ Mensaje claro según el código de Firebase
      const msg = getAuthErrorMessage(e?.code);
      Alert.alert('Error', msg);
    }
  };

  const ageInvalid = computedAge !== null && computedAge < 14;

  // Mensajes amigables por error de Firebase
  function getAuthErrorMessage(code?: string) {
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
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

  // Validador simple de email
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Create Account</Text>

      {/* Email */}
      <View style={styles.inputContainer}>
        <Ionicons name="mail" size={20} color="#999" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      </View>

      {/* Phone (optional) */}
      <View style={styles.inputContainer}>
        <Ionicons name="call" size={20} color="#999" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Phone number (optional)"
          placeholderTextColor="#9CA3AF"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      {/* Password */}
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
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {/* Birth year (required) → abre modal con wheel */}
      <View style={styles.ageRow}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'center',
          }}
        >
          <Ionicons name="calendar" size={18} color="#999" />
          <Text style={styles.pickerLabel}>Birth year *</Text>
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

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Register</Text>
      </TouchableOpacity>

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
    paddingTop: 100,
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

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
    borderRadius: 30,
    paddingHorizontal: 15,
    marginVertical: 10,
    width: '100%',
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: 45, fontSize: 16, color: '#333' },

  ageRow: {
    width: '100%',
    marginTop: 6,
    marginBottom: 10,
    alignItems: 'center',
    gap: 8,
  },
  pickerLabel: { color: '#374151', fontSize: 14, fontWeight: '600' },
  selector: {
    minWidth: 130,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: '#F1F1F1',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  selectorError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  selectorText: { color: '#111827', fontSize: 16, fontWeight: '600' },
  ageHelper: {
    color: '#EF4444',
    marginTop: -6,
    marginBottom: 6,
    textAlign: 'center',
  },

  button: {
    backgroundColor: '#ADCBE3',
    paddingVertical: 12,
    paddingHorizontal: 60,
    borderRadius: 20,
    marginTop: 20,
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
