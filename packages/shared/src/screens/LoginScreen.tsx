// src/screens/LoginScreen.tsx ✅ RNFirebase-only
import React, { useState } from 'react';
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
  Modal,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { firebaseAuth } from '../config/firebaseConfig'; // ✅ RNFirebase auth instance
import { loginWithEmail, sendPasswordReset } from '../services/authService';
import {
  isProfileComplete,
  getUserProfile,
} from '../services/firestoreService';

// 🔒 Feature flag: controla si se muestran o no los botones sociales
const ENABLE_SOCIAL_LOGIN =
  process.env.EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN === 'true';

export default function LoginScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  // 🔔 Modal informativo para reset password
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState('');

  const showInfoModal = (title: string, message: string) => {
    setInfoModalTitle(title);
    setInfoModalMessage(message);
    setInfoModalVisible(true);
  };

  // Validador simple de email
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  // Mensajes amigables por error de Firebase
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
        return 'Password is too weak. Please use at least 8 characters.';

      case 'auth/email-already-in-use':
        return 'This email is already registered. Try logging in.';

      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';

      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';

      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is disabled for this project.';

      default:
        return 'Something went wrong. Please try again.';
    }
  }

  const handleLogin = async () => {
    try {
      const trimmedEmail = email.trim();

      if (!isValidEmail(trimmedEmail)) {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
        return;
      }

      if (!password) {
        Alert.alert('Missing password', 'Please enter your password.');
        return;
      }

      // 🔐 Política mínima: 8 caracteres
      if (password.length < 8) {
        Alert.alert(
          'Weak password',
          'Password must be at least 8 characters long.',
        );
        return;
      }

      const { user } = await loginWithEmail(trimmedEmail, password);

      // 🔹 iOS: bloquear login si el correo NO está verificado
      if (!user.emailVerified) {
        try {
          await firebaseAuth.signOut(); // ✅ RNFirebase
        } catch {}
        Alert.alert(
          'Email not verified',
          'Please verify your email using the link we sent you before logging in on this device. If you don’t see the email, please check your Spam or Junk folder.',
        );
        return;
      }

      const profile: any = await getUserProfile(user.uid);

      if (!profile) {
        navigation.navigate('CompleteProfile', {
          uid: user.uid,
          email: user.email ?? trimmedEmail,
        });
        return;
      }

      // 🔹 ANDROID: si no tiene phone o no está verificado → flujo obligatorio SMS
      // if (
      //   Platform.OS === 'android' &&
      //   (!profile.phone || !profile.phoneVerified)
      // ) {
      //   navigation.navigate('PhoneVerification', {
      //     uid: user.uid,
      //     phone: profile.phone ?? '',
      //   });
      //   return;
      // }

      const complete = await isProfileComplete(user.uid);

      // 👇 antes de navegar
      Keyboard.dismiss();

      setTimeout(() => {
        if (complete) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        } else {
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'CompleteProfile',
                params: {
                  uid: user.uid,
                  email: user.email ?? trimmedEmail,
                  inputNonce: Date.now(), // 🔥 clave
                },
              },
            ],
          });
        }
      }, 150);
    } catch (e: any) {
      const msg = getAuthErrorMessage(e?.code);
      if (__DEV__) {
        console.log('LOGIN ERROR =>', e?.code, e?.message, e);
        console.log('Firestore error code =>', e?.code);
        console.log('Firestore error msg  =>', e?.message);
      }
      Alert.alert('Login Error', msg);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();

    if (!trimmed) {
      showInfoModal(
        'Reset your password',
        'Please type your email address above and tap "Forgot Password" again. We will send you a reset link to that email.',
      );
      return;
    }

    if (!isValidEmail(trimmed)) {
      showInfoModal(
        'Invalid email',
        'Please enter a valid email address (for example: name@example.com).',
      );
      return;
    }

    try {
      await sendPasswordReset(trimmed);

      // Mensaje genérico para no revelar si existe o no
      showInfoModal(
        'Check your email',
        'If this email is registered, you will receive a link to reset your password in the next few minutes.',
      );
    } catch (e: any) {
      if (e?.code === 'auth/network-request-failed') {
        showInfoModal(
          'Network error',
          'We could not contact the server. Please check your connection and try again.',
        );
      } else {
        showInfoModal(
          'Reset your password',
          'If this email is registered, you will receive a link to reset your password.',
        );
      }
    }
  };

  const handleApple = async () => {
    if (!ENABLE_SOCIAL_LOGIN) return;

    Alert.alert('Sign in with Apple', 'Coming soon.');
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}
    >
      <View style={styles.topBar} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 20}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>Welcome to</Text>

          <View style={styles.brandRow}>
            <Image
              source={require('../assets/icon.png')}
              style={{
                width: 60,
                height: 60,
                resizeMode: 'contain',
                marginRight: 0,
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
              placeholder="Email"
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
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setPasswordVisible((prev) => !prev)}
              style={styles.eyeButton}
              activeOpacity={0.7}
            >
              <Ionicons
                name={passwordVisible ? 'eye-off' : 'eye'}
                size={20}
                color="#999"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            activeOpacity={0.85}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          {/* ---------- OR + SOCIAL SOLO SI ESTÁ HABILITADO ---------- */}
          {ENABLE_SOCIAL_LOGIN && (
            <>
              <View style={styles.separatorRow}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>or</Text>
                <View style={styles.separatorLine} />
              </View>

              <View style={styles.socialGroup}>
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

          <View style={styles.linksContainer}>
            <TouchableOpacity onPress={handleForgotPassword}>
              <Text style={styles.link}>Forgot Password</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkSmall}>Don’t Have an Account?</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('IntroVideo', { preview: true })
              }
            >
              <Text
                style={[styles.linkSmall, { textDecorationLine: 'underline' }]}
              >
                Watch intro video
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bottomBar} />

      {/* 🔔 Modal informativo para reset password */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{infoModalTitle}</Text>
            <Text style={styles.modalMessage}>{infoModalMessage}</Text>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setInfoModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    pointerEvents: 'none',
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
    color: '#6B7280',
    marginTop: -4,
    marginBottom: 20,
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
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  separatorText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },

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
    pointerEvents: 'none',
  },

  // 🔔 Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 14,
  },
  modalButton: {
    marginTop: 4,
    backgroundColor: '#3B5A85',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
