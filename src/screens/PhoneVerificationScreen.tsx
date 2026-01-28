// src/screens/PhoneVerificationScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isProfileComplete } from '../services/firestoreService';

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

import { updateUserProfilePartial } from '../services/firestoreService';

type RouteParams = {
  uid: string;
  phone: string;
};

export default function PhoneVerificationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { uid, phone } = route.params as RouteParams;

  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Timer para reintento de envío de SMS
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const maskedPhone = React.useMemo(() => {
    // Mask sencillo: deja últimos 2 dígitos
    const trimmed = phone || '';
    if (trimmed.length < 4) return trimmed;
    return trimmed.slice(0, -2).replace(/./g, '•') + trimmed.slice(-2);
  }, [phone]);

  const sendCode = async () => {
    if (!phone) {
      Alert.alert('Phone required', 'Phone number is missing.');
      return;
    }

    // 🔹 Por ahora desactivamos verificación por SMS en iOS
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Not available yet',
        'Phone verification via SMS is currently only available on Android in this beta version.',
      );
      return;
    }

    try {
      setSending(true);

      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user.');
      }

      const phoneAuthListener = auth().verifyPhoneNumber(phone);

      phoneAuthListener.on('state_changed', (phoneAuthSnapshot) => {
        const state = phoneAuthSnapshot.state;

        if (state === auth.PhoneAuthState.CODE_SENT) {
          setVerificationId(phoneAuthSnapshot.verificationId ?? null);
          setResendTimer(60);
          Alert.alert('Code sent', `We sent a verification code to ${phone}.`);
        }

        if (state === auth.PhoneAuthState.ERROR) {
          console.log(
            '[PhoneVerification] verifyPhoneNumber error',
            phoneAuthSnapshot.error,
          );
          Alert.alert(
            'Error',
            getPhoneErrorMessage(phoneAuthSnapshot.error?.code) ||
              phoneAuthSnapshot.error?.message ||
              'Could not send verification code.',
          );
        }
      });
    } catch (e: any) {
      console.log('[PhoneVerification] sendCode error', e);
      Alert.alert(
        'Error',
        getPhoneErrorMessage(e?.code) ||
          e?.message ||
          'Could not send verification code.',
      );
    } finally {
      setSending(false);
    }
  };

  // Envía el SMS automáticamente al entrar
  useEffect(() => {
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Not available yet',
        'Phone verification via SMS is currently only available on Android in this beta version.',
      );
      return;
    }

    if (!verificationId) {
      Alert.alert(
        'No code sent',
        'We could not find an active verification. Please resend the code.',
      );
      return;
    }

    if (!code.trim()) {
      Alert.alert('Code required', 'Please enter the verification code.');
      return;
    }

    try {
      setVerifying(true);

      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user.');
      }

      const credential = auth.PhoneAuthProvider.credential(
        verificationId,
        code.trim(),
      );

      await currentUser.linkWithCredential(credential);

      await updateUserProfilePartial(uid, {
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
        phone: phone,
      });

      Alert.alert('Phone verified', 'Your phone number has been verified.', [
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const complete = await isProfileComplete(uid);

              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: complete ? 'MainTabs' : 'CompleteProfile',
                    params: complete
                      ? undefined
                      : {
                          uid,
                          email: currentUser.email,
                        },
                  },
                ],
              });
            } catch {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'CompleteProfile',
                    params: {
                      uid,
                      email: currentUser.email,
                    },
                  },
                ],
              });
            }
          },
        },
      ]);
    } catch (e: any) {
      console.log('[PhoneVerification] verify error', e);
      Alert.alert(
        'Error',
        getPhoneErrorMessage(e?.code) ||
          e?.message ||
          'Could not verify this code.',
      );
    } finally {
      setVerifying(false);
    }
  };

  function getPhoneErrorMessage(code?: string) {
    switch (code) {
      case 'auth/invalid-verification-code':
        return 'The code is invalid. Please check it and try again.';
      case 'auth/missing-verification-code':
        return 'Please enter the verification code.';
      case 'auth/code-expired':
        return 'The code has expired. Please request a new one.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a bit and try again.';
      case 'auth/credential-already-in-use':
        return 'This phone number is already associated with another account.';
      default:
        return '';
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 20}
      >
        <View
          style={[
            styles.container,
            {
              paddingTop: insets.top + 40,
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <Text style={styles.title}>Verify your phone</Text>
          <Text style={styles.subtitle}>
            We sent a code by SMS to:{' '}
            <Text style={styles.phoneText}>{maskedPhone}</Text>
          </Text>

          <Text style={styles.label}>Verification code</Text>
          <View style={styles.codeRow}>
            <Ionicons
              name="key-outline"
              size={20}
              color="#6B7280"
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={styles.codeInput}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor="#9CA3AF"
              value={code}
              onChangeText={setCode}
              maxLength={6}
            />
          </View>

          <TouchableOpacity
            style={[styles.verifyButton, verifying && { opacity: 0.7 }]}
            onPress={handleVerify}
            disabled={verifying}
            activeOpacity={0.85}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.verifyButtonText}>Verify code</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive the code?</Text>
            <TouchableOpacity
              onPress={sendCode}
              disabled={sending || resendTimer > 0}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.resendLink,
                  (sending || resendTimer > 0) && { opacity: 0.6 },
                ]}
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 24,
    textAlign: 'center',
  },
  phoneText: {
    fontWeight: '700',
    color: '#111827',
  },
  label: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 6,
    fontWeight: '500',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    marginBottom: 20,
  },
  codeInput: {
    flex: 1,
    fontSize: 18,
    letterSpacing: 4,
    color: '#111827',
    paddingVertical: 4,
  },
  verifyButton: {
    height: 48,
    borderRadius: 999,
    backgroundColor: '#3B5A85',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  verifyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  resendText: {
    fontSize: 13,
    color: '#6B7280',
    marginRight: 4,
  },
  resendLink: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
});
