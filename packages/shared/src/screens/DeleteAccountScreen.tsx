// src/screens/DeleteAccountScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import TopHeader from '../components/TopHeader';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { useTranslation } from '../i18n';
import {
  deleteMyAccountWithReauth,
  getDeleteAccountOptions,
} from '../accountDeletion/deleteAccount';
import type {
  DeleteAccountAttemptMethod,
  DeleteAccountMethod,
} from '../accountDeletion/deleteAccountCore';

type ProfileDoc = {
  profileImage?: string | null;
  topBarColor?: string;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';
};

const CONTINUE_LABEL_KEY: Record<Exclude<DeleteAccountMethod, 'password'>, string> = {
  google: 'settings.deleteAccount.reauthContinueGoogle',
  facebook: 'settings.deleteAccount.reauthContinueFacebook',
  linkedin: 'settings.deleteAccount.reauthContinueLinkedIn',
};

const inputStyle = {
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
} as const;

export default function DeleteAccountScreen() {
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const nav = useNavigation<any>();
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busyMethod, setBusyMethod] =
    useState<DeleteAccountAttemptMethod | null>(null);
  const [showLinkedInGuidance, setShowLinkedInGuidance] = useState(false);
  const attemptLockRef = useRef(false);
  const mountedRef = useRef(true);

  const options = useMemo(() => getDeleteAccountOptions(), []);
  const canDelete = typed.trim().toUpperCase() === 'DELETE';
  const busy = busyMethod !== null;
  const recentSignInVisible =
    options.recentSignInFallback || showLinkedInGuidance;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) return;
        const snap = await firestoreDb.collection('users').doc(uid).get();
        const exists =
          typeof snap.exists === 'function' ? snap.exists() : snap.exists;
        if (!cancelled && exists) {
          const data = snap.data() as ProfileDoc;
          setTopBarColor(data.topBarColor ?? '#3B5A85');
          setTopBarMode(
            data.topBarMode ?? (data.topBarImage ? 'image' : 'color'),
          );
          setTopBarImage(data.topBarImage ?? null);
          setProfileImage(data.profileImage ?? null);
        }
      } catch {
        // Header visuals are decorative; keep the defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const returnToLogin = () => {
    try {
      const parent = nav.getParent?.();
      if (parent?.reset) {
        parent.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else {
        nav.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    } catch {
      // Signed out: AppNavigator already switched to the guest stack.
    }
  };

  const runAttempt = async (method: DeleteAccountAttemptMethod) => {
    const outcome = await deleteMyAccountWithReauth({
      method,
      password: method === 'password' ? password : undefined,
    });
    if (outcome.status === 'in_progress') return;
    if (outcome.status === 'deleted') {
      Alert.alert(
        t('settings.deleteAccount.title'),
        t('settings.deleteAccount.done'),
      );
      returnToLogin();
      return;
    }
    if (outcome.kind === 'linkedin_guidance' && mountedRef.current) {
      setShowLinkedInGuidance(true);
    }
    Alert.alert(t('settings.deleteAccount.title'), t(outcome.messageKey as any));
  };

  const releaseAttempt = () => {
    attemptLockRef.current = false;
  };

  const confirmAndDelete = (method: DeleteAccountAttemptMethod) => {
    if (!canDelete || attemptLockRef.current) return;
    if (method === 'password' && !password.trim()) return;
    attemptLockRef.current = true;
    Alert.alert(
      t('settings.deleteAccount.alertTitle'),
      t('settings.deleteAccount.alertBody'),
      [
        {
          text: t('settings.deleteAccount.alertCancel'),
          style: 'cancel',
          onPress: releaseAttempt,
        },
        {
          text: t('settings.deleteAccount.alertConfirm'),
          style: 'destructive',
          onPress: async () => {
            setBusyMethod(method);
            try {
              await runAttempt(method);
            } catch {
              Alert.alert(
                t('settings.deleteAccount.title'),
                t('settings.deleteAccount.errorUnknown'),
              );
            } finally {
              releaseAttempt();
              if (mountedRef.current) {
                setBusyMethod(null);
                setPassword('');
              }
            }
          },
        },
      ],
      { cancelable: true, onDismiss: releaseAttempt },
    );
  };

  const renderAction = (
    method: DeleteAccountAttemptMethod,
    label: string,
    enabled: boolean,
  ) => {
    const active = enabled && !busy;
    return (
      <TouchableOpacity
        key={method}
        onPress={() => confirmAndDelete(method)}
        disabled={!active}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !active, busy: busyMethod === method }}
        style={{
          backgroundColor: enabled ? '#B91C1C' : '#9CA3AF',
          paddingVertical: 14,
          paddingHorizontal: 12,
          borderRadius: 12,
          alignItems: 'center',
          marginBottom: 12,
          opacity: busy ? 0.8 : 1,
        }}
      >
        {busyMethod === method ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const hasAnyAction = options.methods.length > 0 || recentSignInVisible;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
        >
          <TopHeader
            topBarMode={topBarMode}
            topBarColor={topBarColor}
            topBarImage={topBarImage}
            profileImage={profileImage}
            showAvatar
          />
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 20, fontWeight: '800', marginBottom: 10 }}
            >
              {t('settings.deleteAccount.title')}
            </Text>

            <Text style={{ color: '#374151', marginBottom: 14 }}>
              {t('settings.deleteAccount.body')}
            </Text>

            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={t('settings.deleteAccount.placeholder')}
              accessibilityLabel={t('settings.deleteAccount.placeholder')}
              autoCapitalize="characters"
              editable={!busy}
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            {hasAnyAction ? (
              <>
                <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 6 }}>
                  {t('settings.deleteAccount.methodsTitle')}
                </Text>
                <Text style={{ color: '#374151', marginBottom: 14 }}>
                  {t('settings.deleteAccount.methodsBody')}
                </Text>
              </>
            ) : (
              <Text style={{ color: '#374151', marginBottom: 14 }}>
                {t('settings.deleteAccount.reauthUnavailable')}
              </Text>
            )}

            {options.methods.map((method) =>
              method === 'password' ? (
                <View key={method}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('settings.deleteAccount.passwordPlaceholder')}
                    accessibilityLabel={t(
                      'settings.deleteAccount.passwordPlaceholder',
                    )}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    style={inputStyle}
                  />
                  {renderAction(
                    method,
                    t('settings.deleteAccount.reauthConfirm'),
                    canDelete && Boolean(password.trim()),
                  )}
                </View>
              ) : (
                renderAction(method, t(CONTINUE_LABEL_KEY[method] as any), canDelete)
              ),
            )}

            {recentSignInVisible && (
              <View style={{ marginTop: 4 }}>
                <Text style={{ color: '#374151', marginBottom: 12 }}>
                  {t('settings.deleteAccount.linkedInGuidance')}
                </Text>
                {renderAction(
                  'recent_sign_in',
                  t('settings.deleteAccount.permanently'),
                  canDelete,
                )}
              </View>
            )}

            <TouchableOpacity
              onPress={() => nav.goBack()}
              disabled={busy}
              accessibilityRole="button"
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#3B5A85', fontWeight: '700' }}>
                {t('common.actions.back')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
