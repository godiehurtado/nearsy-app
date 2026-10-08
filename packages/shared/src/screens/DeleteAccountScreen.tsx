/**
 * Delete account — Nearsy 2.0 presentation.
 * The `deleteMyAccount` callable deletes the account; this screen only proves
 * a recent sign-in (current session, or the password / Google / Apple /
 * Facebook method the person selects) and clears local state after the
 * backend confirms. LinkedIn is never started here: a stale LinkedIn session
 * gets guidance to sign in again.
 */
import React, { useEffect, useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { navigationRef } from '../navigation/rootNavigationRef';
import { clearLastKnownVisibility } from '../visibility/visibilityLastKnown';
import { closeVisibilitySessionForLogout } from '../visibility/visibilitySessionGate';
import { stopBackgroundLocationRuntime } from '../visibility/backgroundLocationRuntime';
import {
  deleteAccountWithBackend,
  type AccountDeletionRequest,
} from '../services/accountDeletion';
import {
  endAccountDeletionSession,
  finalizePostAccountDeletionSession,
} from '../services/accountDeletionSession';
import { resolveDeletionFailureMessageKey } from '../services/accountDeletionErrorPresentation';
import {
  DELETE_METHOD_ACTION_KEY,
  DELETE_METHOD_LABEL_KEY,
  buildDeleteAccountOptions,
  buildDeletionRequest,
  canSubmitDeletion,
  isDeleteConfirmationText,
  pickSelectedMethod,
  resolveSessionGuidanceKey,
  summarizeDeletionReauthProviders,
  traceDeletionReauthProviders,
  type DeleteAccountMethodKind,
  type DeleteAccountOptions,
} from '../services/deleteAccountPresentation';
import type { AvailableDeletionReauthMethod } from '../services/deletionReauth';
import { firebaseAuth } from '../config/firebaseConfig';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';

function readDeleteAccountOptions(): DeleteAccountOptions {
  const user = firebaseAuth.currentUser;
  return buildDeleteAccountOptions(user?.providerData ?? [], user?.uid ?? null);
}

function traceCurrentUserMethods(): void {
  const user = firebaseAuth.currentUser;
  traceDeletionReauthProviders(
    summarizeDeletionReauthProviders(user?.providerData ?? [], user?.uid ?? null),
  );
}

const METHOD_ICON: Record<DeleteAccountMethodKind, React.ComponentProps<typeof Ionicons>['name']> = {
  password: 'key-outline',
  google: 'logo-google',
  apple: 'logo-apple',
  facebook: 'logo-facebook',
};

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [pw, setPw] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  /** Set once the backend reports a stale session: skip the local recency shortcut. */
  const forceReauthRef = useRef(false);
  const [options, setOptions] = useState<DeleteAccountOptions>(readDeleteAccountOptions);
  const [selectedMethod, setSelectedMethod] = useState<AvailableDeletionReauthMethod | null>(
    () => pickSelectedMethod(options, null),
  );
  const [sessionGuidanceKey, setSessionGuidanceKey] = useState<string | null>(null);

  const canDelete = isDeleteConfirmationText(typed);
  const canSubmit = canSubmitDeletion({ typed, method: selectedMethod, password: pw });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A pending or failed attempt must not suppress the profile gate later.
      if (!busyRef.current) endAccountDeletionSession();
    };
  }, []);

  const applyOptions = (next: DeleteAccountOptions) => {
    setOptions(next);
    setSelectedMethod((current) => pickSelectedMethod(next, current?.kind ?? null));
  };

  useEffect(() => {
    // Only bounce if the screen opens without an authenticated user.
    // After a successful delete, AppNavigator remounts the guest stack;
    // do not goBack() into a stale authenticated More stack.
    const user = firebaseAuth.currentUser;
    if (!user) {
      return;
    }
    applyOptions(readDeleteAccountOptions());
    traceCurrentUserMethods();
    // Best effort: refresh providerData linked from another device.
    user
      .reload()
      .then(() => {
        if (!mountedRef.current || firebaseAuth.currentUser?.uid !== user.uid) return;
        applyOptions(readDeleteAccountOptions());
        traceCurrentUserMethods();
      })
      .catch(() => undefined);
  }, []);

  const runSuccessfulDeletionExit = async (deletedUid: string) => {
    let social: typeof import('../authentication/social') | null = null;
    try {
      social = await import('../authentication/social');
    } catch {
      social = null;
    }
    const clearFacebookProviderSession = social?.clearFacebookProviderSession;

    await finalizePostAccountDeletionSession({
      closeVisibilityAndLocation: () =>
        closeVisibilitySessionForLogout({ stopRuntime: stopBackgroundLocationRuntime }),
      clearLocalState: () => clearLastKnownVisibility(AsyncStorage, deletedUid),
      clearSocialPrefill: () => social?.clearPendingSocialProfilePrefill(),
      clearGoogleProviderSession: async () => {
        const registry = social?.createDefaultSocialProviderRegistry();
        await registry?.get('google').clearProviderSession();
      },
      clearFacebookProviderSession,
      ensureSignedOut: async () => {
        if (firebaseAuth.currentUser) {
          await firebaseAuth.signOut();
        }
      },
      navigation: navigationRef.isReady()
        ? {
            isReady: () => navigationRef.isReady(),
            reset: (state) => {
              (navigationRef as any).reset(state);
            },
          }
        : null,
    });

    Alert.alert(t('common.appName'), t('settings.deleteAccount.done'));
  };

  const runDeletion = async (request: AccountDeletionRequest) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await deleteAccountWithBackend(request);
      if (result.status === 'deleted') {
        await runSuccessfulDeletionExit(result.uid);
        return;
      }
      // Auth may have flipped to signed-out meanwhile; AppNavigator owns that.
      if (!mountedRef.current) {
        endAccountDeletionSession();
        return;
      }
      if (result.status === 'busy' || result.status === 'cancelled') return;
      const current = readDeleteAccountOptions();
      if (result.status === 'reauth_required') {
        const guidanceKey = resolveSessionGuidanceKey(current);
        setSessionGuidanceKey(guidanceKey);
        Alert.alert(t('common.error'), t(guidanceKey));
        return;
      }
      if (result.reauthRequired) {
        forceReauthRef.current = true;
        if (current.recentSessionOnly) setSessionGuidanceKey(resolveSessionGuidanceKey(current));
      }
      const messageKey = resolveDeletionFailureMessageKey(
        result,
        current.primary,
      );
      Alert.alert(t('common.error'), t(messageKey));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setPw('');
      }
    }
  };

  const handleDelete = () => {
    if (busyRef.current || !canSubmit) return;
    const request = buildDeletionRequest(selectedMethod, pw, forceReauthRef.current);

    Alert.alert(
      t('settings.deleteAccount.alertTitle'),
      t('settings.deleteAccount.alertBody'),
      [
        {
          text: t('settings.deleteAccount.alertCancel'),
          style: 'cancel',
        },
        {
          text: t('settings.deleteAccount.alertConfirm'),
          style: 'destructive',
          onPress: () => {
            void runDeletion(request);
          },
        },
      ],
    );
  };

  /** Changing the selection never opens a provider or starts a deletion. */
  const selectMethod = (method: AvailableDeletionReauthMethod) => {
    if (busy || method.kind === selectedMethod?.kind) return;
    setPw('');
    setSelectedMethod(method);
  };

  const inputColors = {
    color: palette.textPrimary,
    backgroundColor: palette.panel,
    borderColor: palette.border,
  };

  const renderMethodSelector = () => (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('settings.deleteAccount.methodsTitle')}
      style={[
        styles.methodList,
        { backgroundColor: palette.panel, borderColor: palette.border },
      ]}
    >
      {options.methods.map((method, index) => {
        const selected = method.kind === selectedMethod?.kind;
        return (
          <Pressable
            key={method.kind}
            onPress={() => selectMethod(method)}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityLabel={t(DELETE_METHOD_LABEL_KEY[method.kind])}
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
              name={METHOD_ICON[method.kind]}
              size={20}
              color={palette.textPrimary}
            />
            <Text style={[styles.methodLabel, { color: palette.textPrimary }]}>
              {t(DELETE_METHOD_LABEL_KEY[method.kind])}
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

  const renderDangerAction = (label: string, enabled: boolean) => {
    const active = enabled && !busy;
    return (
      <Pressable
        onPress={handleDelete}
        disabled={!active}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !active, busy }}
        style={({ pressed }) => [
          styles.dangerBtn,
          {
            backgroundColor: enabled ? palette.danger : palette.borderStrong,
            opacity: busy || pressed ? 0.85 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.dangerBtnText}>{label}</Text>
        )}
      </Pressable>
    );
  };

  const renderSessionOnlySection = () => {
    const noticeKey =
      sessionGuidanceKey ??
      (options.primary.kind === 'unavailable' && options.primary.reason === 'linkedin_sign_in_again'
        ? 'settings.deleteAccount.linkedInRecentBody'
        : null);
    return (
      <View style={styles.section}>
        {noticeKey ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.notice,
              sessionGuidanceKey
                ? { backgroundColor: palette.dangerBg, borderColor: palette.danger }
                : { backgroundColor: palette.panel, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.noticeText, { color: palette.textPrimary }]}>
              {t(noticeKey)}
            </Text>
          </View>
        ) : null}
        {renderDangerAction(t('settings.deleteAccount.permanently'), canDelete)}
      </View>
    );
  };

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
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => nav.goBack()}
            disabled={busy}
            style={[
              styles.backBtn,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={palette.textPrimary}
            />
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
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel={t('settings.deleteAccount.placeholder')}
            style={[styles.input, inputColors]}
          />

          {selectedMethod ? (
            <View style={styles.section}>
              <Text
                accessibilityRole="header"
                style={[styles.sectionTitle, { color: palette.textPrimary }]}
              >
                {t('settings.deleteAccount.methodsTitle')}
              </Text>
              <Text style={[styles.body, { color: palette.textSecondary }]}>
                {t('settings.deleteAccount.methodsBody')}
              </Text>
              {renderMethodSelector()}
              {selectedMethod.kind === 'password' ? (
                <TextInput
                  value={pw}
                  onChangeText={setPw}
                  placeholder={t('settings.deleteAccount.passwordPlaceholder')}
                  placeholderTextColor={palette.placeholder}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  accessibilityLabel={t('settings.deleteAccount.passwordPlaceholder')}
                  style={[styles.input, inputColors]}
                />
              ) : null}
              {renderDangerAction(t(DELETE_METHOD_ACTION_KEY[selectedMethod.kind]), canSubmit)}
            </View>
          ) : (
            renderSessionOnlySection()
          )}

          <Pressable
            onPress={() => nav.goBack()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backLink}
          >
            <Text style={{ color: palette.primary, fontWeight: '700' }}>
              {t('common.back')}
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
    color: '#fff',
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
});
