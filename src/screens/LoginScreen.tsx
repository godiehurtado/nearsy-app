import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loginWithEmail } from '../services/authService';
import { isProfileComplete } from '../services/firestoreService';
import { useGoogleAuth } from '../services/googleAuth'; // ⬅️ añadido

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const insets = useSafeAreaInsets();

  // Google hooks
  const { signInWithGoogle, request } = useGoogleAuth();

  const handleLogin = async () => {
    try {
      if (!isValidEmail(email)) {
        alert('Invalid email: Please enter a valid email address.');
        return;
      }
      if (!password) {
        alert('Missing password: Please enter your password.');
        return;
      }

      const { user } = await loginWithEmail(email, password);
      const complete = await isProfileComplete(user.uid);
      navigation.navigate(complete ? 'MainTabs' : 'CompleteProfile');
    } catch (e: any) {
      const msg = getAuthErrorMessage(e?.code);
      alert('Login Error: ' + msg);
    }
  };

  const handleGoogle = async () => {
    try {
      const user = await signInWithGoogle();
      const complete = await isProfileComplete(user.uid);
      navigation.navigate(complete ? 'MainTabs' : 'CompleteProfile');
    } catch (e: any) {
      Alert.alert(
        'Google Sign-in',
        e?.message ?? 'Failed to sign in with Google',
      );
    }
  };

  //'En Android usaremos flujo web; lo habilitamos cuando registremos tu Service ID.'
  const handleApple = async () => {
    Alert.alert(
      'Sign in with Apple',
      Platform.OS === 'ios' ? 'Comming Soon' : 'Comming Soon',
    );
  };

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
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}
    >
      <View style={styles.topBar} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>Welcome to</Text>

          <View style={styles.brandRow}>
            <Image
              source={require('../assets/icon.png')}
              style={{
                width: 36,
                height: 36,
                resizeMode: 'contain',
                marginRight: 8,
              }}
            />
            <Text style={styles.title}>Nearsy</Text>
          </View>

          <Text style={styles.slogan}>Be your own billboard</Text>

          <Image
            source={require('../assets/login_image_with_background.png')}
            style={{ width: 250, height: 250, resizeMode: 'contain' }}
          />

          {/* Email */}
          <View style={styles.inputContainer}>
            <Ionicons
              name="person"
              size={20}
              color="#999"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
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
              placeholderTextColor="#999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          {/* ---------- OR SEPARATOR ---------- */}
          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>or</Text>
            <View style={styles.separatorLine} />
          </View>

          {/* Social buttons */}
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

          <View style={styles.linksContainer}>
            <TouchableOpacity>
              <Text style={styles.link}>Forgot Password</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkSmall}>Don’t Have an Account?</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bottomBar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 80,
    backgroundColor: '#fff',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    height: 40,
    width: '100%',
    backgroundColor: '#3B5A85',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    zIndex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2B3A42',
    marginBottom: 10,
  },
  slogan: {
    fontSize: 12,
    color: '#6B7280', // gris elegante
    marginTop: -4, // sútil, acerca el slogan al título
    marginBottom: 20, // espacio antes de la imagen
    fontWeight: '500',
  },
  subtitle: { fontSize: 18 },
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

  button: {
    backgroundColor: '#ADCBE3',
    paddingVertical: 12,
    paddingHorizontal: 60,
    borderRadius: 20,
    marginTop: 20,
  },
  buttonText: { color: '#1A2B3C', fontSize: 16, fontWeight: 'bold' },

  // separator
  separatorRow: {
    width: '100%',
    marginTop: 22,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  separatorText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },

  // social
  socialGroup: { width: '100%', gap: 12, alignItems: 'center' },
  socialBtn: {
    width: '100%',
    height: 46,
    borderRadius: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtn: { backgroundColor: '#1F2937' },
  appleBtn: {
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  socialTextLight: { color: '#fff', fontWeight: '700' },
  socialTextDark: { color: '#111', fontWeight: '700' },

  link: { color: '#555', marginTop: 10, fontSize: 14 },
  linkSmall: { color: '#555', marginTop: 4, marginBottom: 10, fontSize: 12 },
  linksContainer: { marginTop: 20, alignItems: 'center' },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    height: 40,
    width: '100%',
    backgroundColor: '#3B5A85',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});
