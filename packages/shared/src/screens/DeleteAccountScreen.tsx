/**
 * Delete account — Nearsy 2.0 presentation; preserves deletion service contract.
 * Reauthentication is provider-aware (password / Google / Apple).
 */
import React, { useEffect, useMemo, useState } from 'react';
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

import { navigationRef } from '../navigation/rootNavigationRef';
import { deleteAccountAndData } from '../services/accountDeletion';
import { resolveAccountDeletionErrorMessageKey } from '../services/accountDeletionErrorPresentation';
import {
  finalizePostAccountDeletionSession,
} from '../services/accountDeletionSession';
import {
  AccountDeletionReauthError,
  resolveDeletionReauthMethod,
  reauthenticateForAccountDeletion,
  type DeletionReauthMethod,
} from '../services/deletionReauth';
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

function resolveMethodFromCurrentUser(): DeletionReauthMethod {
  const user = firebaseAuth.currentUser;
  return resolveDeletionReauthMethod(user?.providerData ?? []);
}

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [pw, setPw] = useState('');
  const [showReauth, setShowReauth] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [reauthMethod, setReauthMethod] = useState<DeletionReauthMethod>(() =>
    resolveMethodFromCurrentUser(),
  );

  const canDelete = typed.trim().toUpperCase() === 'DELETE';

  useEffect(() => {
    // Only bounce if the screen opens without an authenticated user.
    // After a successful delete, AppNavigator remounts the guest stack;
    // do not goBack() into a stale authenticated More stack.
    if (!firebaseAuth.currentUser) {
      return;
    }
    setReauthMethod(resolveMethodFromCurrentUser());
  }, []);

  const reauthBodyKey = useMemo(() => {
    if (reauthMethod.kind === 'password') {
      return 'settings.deleteAccount.reauthBody';
    }
    if (reauthMethod.kind === 'google') {
      return 'settings.deleteAccount.reauthBodyGoogle';
    }
    if (reauthMethod.kind === 'apple') {
      return 'settings.deleteAccount.reauthBodyApple';
    }
    return 'settings.deleteAccount.reauthUnavailable';
  }, [reauthMethod.kind]);

  const alertDeletionError = (err: unknown) => {
    if (err instanceof AccountDeletionReauthError) {
      Alert.alert(t('common.error'), t(err.messageKey));
      return;
    }
    if (__DEV__) {
      const code =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : undefined;
      console.warn('[deleteAccount]', {
        code,
        messageKey: resolveAccountDeletionErrorMessageKey(err),
      });
    }
    Alert.alert(
      t('common.error'),
      t(resolveAccountDeletionErrorMessageKey(err)),
    );
  };

  const runSuccessfulDeletionExit = async () => {
    const { clearPendingSocialProfilePrefill, createDefaultSocialProviderRegistry } =
      await import('../authentication/social');

    clearPendingSocialProfilePrefill();

    await finalizePostAccountDeletionSession({
      clearSocialPrefill: () => clearPendingSocialProfilePrefill(),
      clearGoogleProviderSession: async () => {
        const registry = createDefaultSocialProviderRegistry();
        await registry.get('google').clearProviderSession();
      },
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

  const handleDelete = () => {
    if (busy) return;

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
          onPress: async () => {
            if (busy) return;
            try {
              setBusy(true);
              await deleteAccountAndData();
              await runSuccessfulDeletionExit();
            } catch (e: any) {
              const code = e?.code || '';
              if (String(code).includes('auth/requires-recent-login')) {
                const method = resolveMethodFromCurrentUser();
                setReauthMethod(method);
                setShowReauth(true);
                return;
              }
              Alert.alert(
                t('common.error'),
                t(resolveAccountDeletionErrorMessageKey(e)),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleReauthAndDelete = async () => {
    if (busy) return;
    if (reauthMethod.kind === 'unavailable') {
      Alert.alert(
        t('common.error'),
        t('settings.deleteAccount.reauthUnavailable'),
      );
      return;
    }
    if (reauthMethod.kind === 'password' && !pw.trim()) {
      return;
    }

    try {
      setBusy(true);
      await reauthenticateForAccountDeletion({
        method: reauthMethod,
        password: pw,
      });
      await deleteAccountAndData();
      await runSuccessfulDeletionExit();
    } catch (err: unknown) {
      alertDeletionError(err);
    } finally {
      setBusy(false);
    }
  };

  const renderReauthActions = () => {
    if (reauthMethod.kind === 'unavailable') {
      return (
        <Text
          style={[styles.body, { color: palette.textSecondary }]}
          accessibilityRole="text"
        >
          {t('settings.deleteAccount.reauthUnavailable')}
        </Text>
      );
    }

    if (reauthMethod.kind === 'password') {
      return (
        <>
          <TextInput
            value={pw}
            onChangeText={setPw}
            placeholder={t('settings.deleteAccount.passwordPlaceholder')}
            placeholderTextColor={palette.placeholder}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel={t(
              'settings.deleteAccount.passwordPlaceholder',
            )}
            style={[
              styles.input,
              {
                color: palette.textPrimary,
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
          />
          <Pressable
            onPress={handleReauthAndDelete}
            disabled={!pw.trim() || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !pw.trim() || busy, busy }}
            accessibilityLabel={t('settings.deleteAccount.reauthConfirm')}
            style={({ pressed }) => [
              styles.dangerBtn,
              {
                backgroundColor: pw.trim()
                  ? palette.danger
                  : palette.borderStrong,
                opacity: busy || pressed ? 0.85 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.dangerBtnText}>
                {t('settings.deleteAccount.reauthConfirm')}
              </Text>
            )}
          </Pressable>
        </>
      );
    }

    const labelKey =
      reauthMethod.kind === 'google'
        ? 'settings.deleteAccount.reauthContinueGoogle'
        : 'settings.deleteAccount.reauthContinueApple';

    return (
      <Pressable
        onPress={handleReauthAndDelete}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        accessibilityLabel={t(labelKey)}
        style={({ pressed }) => [
          styles.dangerBtn,
          {
            backgroundColor: palette.danger,
            opacity: busy || pressed ? 0.85 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.dangerBtnText}>{t(labelKey)}</Text>
        )}
      </Pressable>
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
            accessibilityLabel={t('settings.deleteAccount.placeholder')}
            style={[
              styles.input,
              {
                color: palette.textPrimary,
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
          />

          {showReauth ? (
            <View style={styles.reauthBlock}>
              <Text style={[styles.body, { color: palette.textSecondary }]}>
                {t(reauthBodyKey)}
              </Text>
              {renderReauthActions()}
            </View>
          ) : (
            <Pressable
              disabled={!canDelete || busy}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canDelete || busy, busy }}
              accessibilityLabel={t('settings.deleteAccount.permanently')}
              style={({ pressed }) => [
                styles.dangerBtn,
                {
                  backgroundColor: canDelete
                    ? palette.danger
                    : palette.borderStrong,
                  opacity: busy || pressed ? 0.85 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.dangerBtnText}>
                  {t('settings.deleteAccount.permanently')}
                </Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={() => nav.goBack()}
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
  reauthBlock: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  dangerBtn: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
  },
  backLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
});
