// src/screens/AccountDeletionPendingScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  leavePendingAccountDeletion,
  resolvePendingAccountDeletion,
} from '../accountDeletion/deleteAccount';
import type { DeleteAccountOutcome } from '../accountDeletion/deleteAccountCore';

const SIGN_IN_AGAIN_KINDS = new Set(['stale_session', 'unauthenticated', 'linkedin_guidance']);

function messageKeyFor(outcome: DeleteAccountOutcome | null): string {
  if (outcome?.status === 'failed' && SIGN_IN_AGAIN_KINDS.has(outcome.kind)) {
    return 'settings.deleteAccount.pendingSignInAgain';
  }
  return 'settings.deleteAccount.pendingBody';
}

/**
 * Rendered by the root navigator while an account deletion has an unknown
 * outcome. The profile gate stays off; the only ways out are a reconciled
 * deletion (→ Login), an explicit sign out (→ Login) or Auth signing out.
 */
export default function AccountDeletionPendingScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(true);
  const [outcome, setOutcome] = useState<DeleteAccountOutcome | null>(null);
  const mountedRef = useRef(true);

  const run = async (action: () => Promise<DeleteAccountOutcome | void>) => {
    setBusy(true);
    try {
      const result = await action();
      if (mountedRef.current && result && result.status !== 'in_progress') {
        setOutcome(result);
      }
    } catch {
      // The pending state stays; the person can retry or sign out.
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void run(() => resolvePendingAccountDeletion({ retry: false }));
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: palette.background,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.textPrimary }]}
      >
        {t('settings.deleteAccount.pendingTitle')}
      </Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        {t(messageKeyFor(outcome) as any)}
      </Text>

      <Pressable
        onPress={() => void run(() => resolvePendingAccountDeletion({ retry: true }))}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('settings.deleteAccount.pendingRetry')}
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => [
          styles.retryBtn,
          {
            backgroundColor: palette.panel,
            borderColor: palette.border,
            opacity: busy || pressed ? 0.7 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <Text style={[styles.retryText, { color: palette.textPrimary }]}>
            {t('settings.deleteAccount.pendingRetry')}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => void run(() => leavePendingAccountDeletion())}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('settings.deleteAccount.pendingSignOut')}
        accessibilityState={{ disabled: busy }}
        hitSlop={8}
        style={styles.signOutLink}
      >
        <Text
          style={[
            styles.signOutText,
            { color: palette.primary, opacity: busy ? 0.5 : 1 },
          ]}
        >
          {t('settings.deleteAccount.pendingSignOut')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: screenPadding.horizontal,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.45,
    marginBottom: spacing.xl,
  },
  retryBtn: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryText: {
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  signOutLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  signOutText: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.base,
  },
});
