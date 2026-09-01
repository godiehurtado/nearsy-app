/**
 * Delete account — Nearsy 2.0 presentation; preserves deletion service contract.
 */
import React, { useEffect, useState } from 'react';
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

import { deleteAccountAndData } from '../services/accountDeletion';
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

export default function DeleteAccountScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [pw, setPw] = useState('');
  const [showReauth, setShowReauth] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const canDelete = typed.trim().toUpperCase() === 'DELETE';

  useEffect(() => {
    // Ensure auth is still present when opening the screen.
    if (!firebaseAuth.currentUser) {
      nav.goBack();
    }
  }, [nav]);

  const navigateToLogin = () => {
    const parent = nav.getParent?.();
    if (parent) {
      parent.reset({ index: 0, routes: [{ name: 'Login' }] });
    } else {
      nav.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  const handleDelete = () => {
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
            try {
              setBusy(true);
              await deleteAccountAndData();
              Alert.alert(t('common.appName'), t('settings.deleteAccount.done'));
              navigateToLogin();
            } catch (e: any) {
              const code = e?.code || '';
              if (code === 'auth/requires-recent-login') {
                setShowReauth(true);
                return;
              }
              Alert.alert(
                t('common.error'),
                e?.message || t('settings.deleteAccount.error'),
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
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
                {t('settings.deleteAccount.reauthBody')}
              </Text>
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
                onPress={async () => {
                  try {
                    setBusy(true);
                    const { reauthWithPassword } =
                      await import('../services/reauth');
                    await reauthWithPassword(pw);
                    await deleteAccountAndData();
                    Alert.alert(
                      t('common.appName'),
                      t('settings.deleteAccount.done'),
                    );
                    navigateToLogin();
                  } catch (err: any) {
                    Alert.alert(
                      t('common.error'),
                      err?.message || t('settings.deleteAccount.reauthError'),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={!pw.trim() || busy}
                accessibilityRole="button"
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
            </View>
          ) : (
            <Pressable
              disabled={!canDelete || busy}
              onPress={handleDelete}
              accessibilityRole="button"
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
