// src/screens/PhoneVerificationScreen.tsx ✅ RNFirebase-only
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { firebaseAuth } from '../config/firebaseConfig';
import { PhoneAuthProvider, PhoneAuthState } from '@react-native-firebase/auth';
import {
  isProfileComplete,
  updateUserProfilePartial,
} from '../services/firestoreService';

type RouteParams = {
  uid: string;
  phone: string;
};

export default function PhoneVerificationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { uid, phone } = (route.params || {}) as RouteParams;

  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Guardamos el listener object para poder limpiar y no acumular listeners
  const phoneListenerRef = useRef<any>(null);

  // Timer para reintento de envío de SMS
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  // Cleanup listener al salir
  useEffect(() => {
    return () => {
      if (phoneListenerRef.current) {
        try {
          if (
            typeof phoneListenerRef.current.removeAllListeners === 'function'
          ) {
            phoneListenerRef.current.removeAllListeners('state_changed');
          } else if (typeof phoneListenerRef.current.off === 'function') {
            phoneListenerRef.current.off('state_changed');
          }
        } catch {
          // ignore
        }
        phoneListenerRef.current = null;
      }
    };
  }, []);

  const maskedPhone = useMemo(() => {
    const trimmed = (phone || '').trim();
    if (trimmed.length < 4) return trimmed;
    return trimmed.slice(0, -2).replace(/./g, '•') + trimmed.slice(-2);
  }, [phone]);

  const getPhoneErrorMessage = (code?: string) => {
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
      case 'auth/provider-already-linked':
        return 'A phone number is already linked to this account. We will update it instead.';
      default:
        return '';
    }
  };

  const handleVerifyInternal = async (vId: string, c: string) => {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) throw new Error('No authenticated user.');

    // Seguridad: validar que el uid de route coincida con el user actual
    if (uid && currentUser.uid !== uid) {
      throw new Error('Session mismatch. Please log in again.');
    }

    const credential = PhoneAuthProvider.credential(vId, c.trim());

    // ✅ Primero intentamos link, si ya existe provider ligado usamos updatePhoneNumber
    try {
      await currentUser.linkWithCredential(credential);
    } catch (err: any) {
      const errCode = err?.code;
      if (
        errCode === 'auth/provider-already-linked' ||
        errCode === 'auth/credential-already-in-use'
      ) {
        await currentUser.updatePhoneNumber(credential);
      } else {
        throw err;
      }
    }

    // ✅ Guardamos en Firestore (y marcamos verificado)
    await updateUserProfilePartial(currentUser.uid, {
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      phone: phone.trim(),
    });

    return currentUser;
  };

  const sendCode = async () => {
    if (!phone?.trim()) {
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

      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) throw new Error('No authenticated user.');

      // ✅ evita múltiples listeners
      if (phoneListenerRef.current) {
        try {
          if (
            typeof phoneListenerRef.current.removeAllListeners === 'function'
          ) {
            phoneListenerRef.current.removeAllListeners('state_changed');
          } else if (typeof phoneListenerRef.current.off === 'function') {
            phoneListenerRef.current.off('state_changed');
          }
        } catch {
          // ignore
        }
        phoneListenerRef.current = null;
      }

      const phoneAuthListener = firebaseAuth.verifyPhoneNumber(phone);
      phoneListenerRef.current = phoneAuthListener;

      phoneAuthListener.on('state_changed', async (phoneAuthSnapshot: any) => {
        const state = phoneAuthSnapshot.state;

        if (state === PhoneAuthState.CODE_SENT) {
          setVerificationId(phoneAuthSnapshot.verificationId ?? null);
          setResendTimer(60);
          Alert.alert(
            'Code sent',
            `We sent a verification code to ${maskedPhone}.`,
          );
          return;
        }

        // ✅ A veces Android auto-verifica
        if (state === PhoneAuthState.AUTO_VERIFIED) {
          try {
            const vId = phoneAuthSnapshot.verificationId;
            const sms = (phoneAuthSnapshot as any)?.code; // no siempre viene
            if (vId && sms) {
              setVerificationId(vId);
              setCode(String(sms));
              await handleVerifyInternal(vId, String(sms));
            }
          } catch {
            // si falla, el usuario puede ingresar el código manual
          }
          return;
        }

        if (state === PhoneAuthState.AUTO_VERIFY_TIMEOUT) {
          // Dejamos el verificationId si está disponible
          if (phoneAuthSnapshot.verificationId) {
            setVerificationId(phoneAuthSnapshot.verificationId);
          }
          return;
        }

        if (state === PhoneAuthState.ERROR) {
          const errCode = phoneAuthSnapshot.error?.code;
          Alert.alert(
            'Error',
            getPhoneErrorMessage(errCode) ||
              phoneAuthSnapshot.error?.message ||
              'Could not send verification code.',
          );
          return;
        }
      });
    } catch (e: any) {
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

      const currentUser = await handleVerifyInternal(verificationId, code);

      Alert.alert('Phone verified', 'Your phone number has been verified.', [
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const complete = await isProfileComplete(currentUser.uid);

              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: complete ? 'MainTabs' : 'CompleteProfile',
                    params: complete
                      ? undefined
                      : { uid: currentUser.uid, email: currentUser.email },
                  },
                ],
              });
            } catch {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'CompleteProfile',
                    params: { uid: currentUser.uid, email: currentUser.email },
                  },
                ],
              });
            }
          },
        },
      ]);
    } catch (e: any) {
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

          {sending && (
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 6, color: '#6B7280', fontSize: 12 }}>
                Sending SMS…
              </Text>
            </View>
          )}
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
