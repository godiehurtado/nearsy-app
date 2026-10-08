// src/screens/DeleteAccountScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';
import {
  deleteMyAccountWithReauth,
  getDeleteAccountOptions,
} from '../accountDeletion/deleteAccount';
import { isDeleteConfirmationText } from '../accountDeletion/deleteConfirmation';
import type {
  DeleteAccountAttemptMethod,
  DeleteAccountMethod,
} from '../accountDeletion/deleteAccountCore';

const ACTION_LABEL_KEY: Record<DeleteAccountMethod, string> = {
  password: 'settings.deleteAccount.reauthConfirm',
  google: 'settings.deleteAccount.reauthContinueGoogle',
  facebook: 'settings.deleteAccount.reauthContinueFacebook',
};

const METHOD_LABEL_KEY: Record<DeleteAccountMethod, string> = {
  password: 'settings.deleteAccount.methodPassword',
  google: 'settings.deleteAccount.methodGoogle',
  facebook: 'settings.deleteAccount.methodFacebook',
};

const METHOD_ICON: Record<DeleteAccountMethod, keyof typeof Ionicons.glyphMap> = {
  password: 'key-outline',
  google: 'logo-google',
  facebook: 'logo-facebook',
};

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busyMethod, setBusyMethod] =
    useState<DeleteAccountAttemptMethod | null>(null);
  const [showLinkedInGuidance, setShowLinkedInGuidance] = useState(false);
  const attemptLockRef = useRef(false);
  const mountedRef = useRef(true);

  const options = useMemo(() => getDeleteAccountOptions(), []);
  const [selectedMethod, setSelectedMethod] = useState<DeleteAccountMethod | null>(
    () => options.methods[0] ?? null,
  );
  const canDelete = isDeleteConfirmationText(typed);
  const busy = busyMethod !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runAttempt = async (method: DeleteAccountAttemptMethod) => {
    const outcome = await deleteMyAccountWithReauth({
      method,
      password: method === 'password' ? password : undefined,
    });
    // Unresolved: the root replaces this screen with the pending state.
    if (outcome.status === 'in_progress' || outcome.status === 'unresolved') return;
    if (outcome.status === 'deleted') {
      // The root navigator owns the exit: it mounts the guest stack (Login)
      // once the deletion barrier is released.
      Alert.alert(
        t('settings.deleteAccount.title'),
        t('settings.deleteAccount.done'),
      );
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

  const selectMethod = (method: DeleteAccountMethod) => {
    if (busy || method === selectedMethod) return;
    setPassword('');
    setSelectedMethod(method);
  };

  const inputColors = {
    color: palette.textPrimary,
    backgroundColor: palette.panel,
    borderColor: palette.border,
  };

  const renderDangerAction = (
    method: DeleteAccountAttemptMethod,
    label: string,
    enabled: boolean,
  ) => {
    const active = enabled && !busy;
    return (
      <Pressable
        key={method}
        onPress={() => confirmAndDelete(method)}
        disabled={!active}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !active, busy: busyMethod === method }}
        style={({ pressed }) => [
          styles.dangerBtn,
          {
            backgroundColor: enabled ? palette.danger : palette.borderStrong,
            opacity: busy || pressed ? 0.85 : 1,
          },
        ]}
      >
        {busyMethod === method ? (
          <ActivityIndicator color={palette.onDanger} />
        ) : (
          <Text style={[styles.dangerBtnText, { color: palette.onDanger }]}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  const renderMethodSelector = () => (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.methodList,
        { backgroundColor: palette.panel, borderColor: palette.border },
      ]}
    >
      {options.methods.map((method, index) => {
        const selected = method === selectedMethod;
        return (
          <Pressable
            key={method}
            onPress={() => selectMethod(method)}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityLabel={t(METHOD_LABEL_KEY[method] as any)}
            accessibilityState={{ checked: selected, disabled: busy }}
            style={({ pressed }) => [
              styles.methodRow,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: palette.border,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name={METHOD_ICON[method]}
              size={20}
              color={palette.textPrimary}
            />
            <Text style={[styles.methodLabel, { color: palette.textPrimary }]}>
              {t(METHOD_LABEL_KEY[method] as any)}
            </Text>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? palette.primary : palette.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );

  const hasAnyAction = options.methods.length > 0 || options.recentSessionOnly;

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + spacing.md,
            paddingBottom: spacing.xxxl + insets.bottom,
            paddingHorizontal: screenPadding.horizontal,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => nav.goBack()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.back')}
            hitSlop={8}
            style={[
              styles.backBtn,
              { backgroundColor: palette.panel, borderColor: palette.border },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
          </Pressable>

          <Text
            accessibilityRole="header"
            style={[styles.title, { color: palette.textPrimary }]}
          >
            {t('settings.deleteAccount.title')}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            {t('settings.deleteAccount.body')}
          </Text>
          <Text style={[styles.confirmHint, { color: palette.danger }]}>
            {t('settings.deleteAccount.confirm')}
          </Text>

          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={t('settings.deleteAccount.placeholder')}
            placeholderTextColor={palette.placeholder}
            accessibilityLabel={t('settings.deleteAccount.placeholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            style={[styles.input, inputColors]}
          />

          {options.methods.length > 0 && selectedMethod && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
                {t('settings.deleteAccount.methodsTitle')}
              </Text>
              <Text style={[styles.body, { color: palette.textSecondary }]}>
                {t('settings.deleteAccount.methodsBody')}
              </Text>
              {options.methods.length > 1 && renderMethodSelector()}
              {selectedMethod === 'password' && (
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('settings.deleteAccount.passwordPlaceholder')}
                  placeholderTextColor={palette.placeholder}
                  accessibilityLabel={t('settings.deleteAccount.passwordPlaceholder')}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  style={[styles.input, inputColors]}
                />
              )}
              {renderDangerAction(
                selectedMethod,
                t(ACTION_LABEL_KEY[selectedMethod] as any),
                selectedMethod === 'password'
                  ? canDelete && Boolean(password.trim())
                  : canDelete,
              )}
            </View>
          )}

          {options.recentSessionOnly && (
            <View style={styles.section}>
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.notice,
                  showLinkedInGuidance
                    ? { backgroundColor: palette.dangerBg, borderColor: palette.danger }
                    : { backgroundColor: palette.panel, borderColor: palette.border },
                ]}
              >
                <Text style={[styles.noticeText, { color: palette.textPrimary }]}>
                  {t(
                    showLinkedInGuidance
                      ? 'settings.deleteAccount.linkedInGuidance'
                      : 'settings.deleteAccount.linkedInRecentBody',
                  )}
                </Text>
              </View>
              {renderDangerAction(
                'recent_session',
                t('settings.deleteAccount.permanently'),
                canDelete,
              )}
            </View>
          )}

          {!hasAnyAction && (
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              {t('settings.deleteAccount.reauthUnavailable')}
            </Text>
          )}

          <Pressable
            onPress={() => nav.goBack()}
            disabled={busy}
            accessibilityRole="button"
            style={styles.backLink}
          >
            <Text style={[styles.backLinkText, { color: palette.primary }]}>
              {t('common.actions.back')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.45,
    marginBottom: spacing.sm,
  },
  confirmHint: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: fontSize.base,
    minHeight: 48,
  },
  section: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    marginBottom: spacing.xs,
  },
  methodList: {
    borderWidth: 1,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  methodRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  methodLabel: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  notice: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.45,
  },
  dangerBtn: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dangerBtnText: {
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  backLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  backLinkText: {
    fontWeight: fontWeight.bold,
  },
});
