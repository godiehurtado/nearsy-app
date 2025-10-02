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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loginWithEmail } from '../services/authService';
import { isProfileComplete } from '../services/firestoreService';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const insets = useSafeAreaInsets();

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
          <Image
            source={require('../assets/icon.png')}
            style={{ width: 48, height: 48, resizeMode: 'contain' }}
          />
          <Text style={styles.subtitle}>Welcome to</Text>
          <Text style={styles.title}>Nearsy</Text>

          <Image
            source={require('../assets/login_image_with_background.png')}
            style={{ width: 250, height: 250, resizeMode: 'contain' }}
          />

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

          <View style={styles.linksContainer}>
            <TouchableOpacity>
              <Text style={styles.link}>Forgot Password</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkSmall}>Don’t Have an Account?</Text>
            </TouchableOpacity>
          </View>

          {/* espacio para que no lo tape la barra inferior */}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2B3A42',
    marginBottom: 10,
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
