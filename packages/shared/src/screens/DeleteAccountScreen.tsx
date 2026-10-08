/**
 * Delete account — Nearsy 2.0 presentation.
 * The `deleteMyAccount` callable deletes the account; this screen only proves
 * a recent sign-in (current session, or password / Google / Apple / Facebook
 * reauthentication) and clears local state after the backend confirms.
 * LinkedIn is never started here: a stale LinkedIn session gets guidance to
 * sign in again.
 */
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
  resolveDeletionReauthMethod,
  resolveDeletionReauthMethods,
  type AvailableDeletionReauthMethod,
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

type ReauthOptions = {
  primary: DeletionReauthMethod;
  all: AvailableDeletionReauthMethod[];
};

function resolveReauthOptionsFromCurrentUser(): ReauthOptions {
  const user = firebaseAuth.currentUser;
  const providerData = user?.providerData ?? [];
  return {
    primary: resolveDeletionReauthMethod(providerData, { uid: user?.uid ?? null }),
    all: resolveDeletionReauthMethods(providerData),
  };
}

const CONTINUE_LABEL_KEY: Record<Exclude<AvailableDeletionReauthMethod['kind'], 'password'>, string> = {
  google: 'settings.deleteAccount.reauthContinueGoogle',
  apple: 'settings.deleteAccount.reauthContinueApple',
  facebook: 'settings.deleteAccount.reauthContinueFacebook',
};

const SWITCH_LABEL_KEY: Record<AvailableDeletionReauthMethod['kind'], string> = {
  password: 'settings.deleteAccount.reauthSwitchPassword',
  google: 'settings.deleteAccount.reauthSwitchGoogle',
  apple: 'settings.deleteAccount.reauthSwitchApple',
  facebook: 'settings.deleteAccount.reauthSwitchFacebook',
};

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [pw, setPw] = useState('');
  const [showReauth, setShowReauth] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [reauthOptions, setReauthOptions] = useState<ReauthOptions>(() =>
    resolveReauthOptionsFromCurrentUser(),
  );
  const [reauthMethod, setReauthMethod] = useState<DeletionReauthMethod>(
    () => reauthOptions.primary,
  );

  const canDelete = typed.trim().toUpperCase() === 'DELETE';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A pending or failed attempt must not suppress the profile gate later.
      if (!busyRef.current) endAccountDeletionSession();
    };
  }, []);

  useEffect(() => {
    // Only bounce if the screen opens without an authenticated user.
    // After a successful delete, AppNavigator remounts the guest stack;
    // do not goBack() into a stale authenticated More stack.
    if (!firebaseAuth.currentUser) {
      return;
    }
    const options = resolveReauthOptionsFromCurrentUser();
    setReauthOptions(options);
    setReauthMethod(options.primary);
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
    if (reauthMethod.kind === 'facebook') {
      return 'settings.deleteAccount.reauthBodyFacebook';
    }
    if (reauthMethod.reason === 'linkedin_sign_in_again') {
      return 'settings.deleteAccount.linkedInSignInAgain';
    }
    return 'settings.deleteAccount.reauthUnavailable';
  }, [reauthMethod]);

  const openReauth = () => {
    const options = resolveReauthOptionsFromCurrentUser();
    setReauthOptions(options);
    setReauthMethod((current) =>
      current.kind !== 'unavailable' && options.all.some((m) => m.kind === current.kind)
        ? current
        : options.primary,
    );
    setShowReauth(true);
  };

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
      if (result.status === 'reauth_required') {
        openReauth();
        return;
      }
      if (result.reauthRequired) openReauth();
      const messageKey = resolveDeletionFailureMessageKey(
        result,
        resolveReauthOptionsFromCurrentUser().primary,
      );
      Alert.alert(t('common.error'), t(messageKey));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleDelete = () => {
    if (busyRef.current) return;

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
            void runDeletion({});
          },
        },
      ],
    );
  };

  const handleReauthAndDelete = async () => {
    if (busyRef.current) return;
    if (reauthMethod.kind === 'unavailable') {
      Alert.alert(t('common.error'), t(reauthBodyKey));
      return;
    }
    if (reauthMethod.kind === 'password' && !pw.trim()) {
      return;
    }
    await runDeletion({ reauth: { method: reauthMethod, password: pw } });
  };

  const renderSwitchMethods = () => {
    const others = reauthOptions.all.filter((m) => m.kind !== reauthMethod.kind);
    if (others.length === 0) return null;
    return others.map((method) => (
      <Pressable
        key={method.kind}
        onPress={() => {
          setPw('');
          setReauthMethod(method);
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t(SWITCH_LABEL_KEY[method.kind])}
        style={styles.switchLink}
      >
        <Text style={{ color: palette.primary, fontWeight: '700' }}>
          {t(SWITCH_LABEL_KEY[method.kind])}
        </Text>
      </Pressable>
    ));
  };

  const renderReauthActions = () => {
    if (reauthMethod.kind === 'unavailable') {
      // Retry only succeeds once the user signed in again themselves.
      return (
        <Pressable
          onPress={() => {
            void runDeletion({});
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          accessibilityLabel={t('settings.deleteAccount.permanently')}
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
            <Text style={styles.dangerBtnText}>
              {t('settings.deleteAccount.permanently')}
            </Text>
          )}
        </Pressable>
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

    const labelKey = CONTINUE_LABEL_KEY[reauthMethod.kind];

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
              {renderSwitchMethods()}
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
  switchLink: {
    marginTop: spacing.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  backLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
});
