/**
 * Settings — Sign-in methods (ENH-AUTH-LINK-01, Android).
 * Methods come from Firebase providerData (+ LinkedIn UID contract) only.
 * The only authorized place to link Facebook to the signed-in account.
 * No unlink.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import {
  hasFacebookLinked,
  messageKeyForFacebookLinkError,
  type FacebookLinkUserSnapshot,
} from '../authentication/facebook/facebookAccountLinking';
import {
  resolveSignInMethods,
  type SignInMethodId,
} from '../authentication/signInMethods';
import { isNearsyFacebookAuthConfigured } from '../config/facebookAuthConfig';
import {
  createFacebookAccountLinker,
  getFacebookLinkUserSnapshot,
  reloadFacebookLinkUser,
} from '../services/facebookAccountLinking';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';

const METHOD_ICONS: Record<
  SignInMethodId,
  React.ComponentProps<typeof Ionicons>['name']
> = {
  email: 'mail-outline',
  google: 'logo-google',
  facebook: 'logo-facebook',
  linkedin: 'logo-linkedin',
};

export default function SignInMethodsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [user, setUser] = useState<FacebookLinkUserSnapshot | null>(() =>
    getFacebookLinkUserSnapshot(),
  );
  const [connecting, setConnecting] = useState(false);
  const connectingRef = useRef(false);

  useEffect(() => {
    let active = true;
    reloadFacebookLinkUser()
      .then((snapshot) => {
        if (active) setUser(snapshot);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const confirmConnect = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          t('settings.signInMethods.confirmTitle'),
          t('settings.signInMethods.confirmBody'),
          [
            {
              text: t('settings.signInMethods.confirmCancel'),
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: t('settings.signInMethods.confirmContinue'),
              onPress: () => resolve(true),
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [t],
  );
  const confirmRef = useRef(confirmConnect);
  confirmRef.current = confirmConnect;

  const linkFacebook = useMemo(
    () => createFacebookAccountLinker(() => confirmRef.current()),
    [],
  );

  const handleConnectFacebook = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    try {
      const outcome = await linkFacebook();
      if (outcome.status === 'linked' || outcome.status === 'alreadyLinked') {
        setUser((prev) =>
          prev ? { uid: prev.uid, providerIds: outcome.providerIds } : prev,
        );
        Alert.alert(
          t('settings.signInMethods.linkedTitle'),
          t('settings.signInMethods.linkedBody'),
        );
        return;
      }
      setUser(getFacebookLinkUserSnapshot());
      if (outcome.status === 'failed') {
        Alert.alert(
          t('settings.signInMethods.errors.title'),
          t(messageKeyForFacebookLinkError(outcome.code)),
        );
      }
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }, [linkFacebook, t]);

  const methods = resolveSignInMethods(user);
  const canConnectFacebook =
    !!user && !hasFacebookLinked(user) && isNearsyFacebookAuthConfigured();

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.signInMethods.back')}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="chevron-back" size={26} color={palette.textPrimary} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: palette.textPrimary }]}
        >
          {t('settings.signInMethods.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.lg,
          paddingBottom: 32 + insets.bottom,
        }}
      >
        {user ? (
          <>
            <Text
              style={[styles.description, { color: palette.textSecondary }]}
            >
              {t('settings.signInMethods.description')}
            </Text>
            <SettingsSection title={t('settings.sections.account')}>
              {methods.map((method, index) => (
                <SettingsRow
                  key={method.id}
                  icon={METHOD_ICONS[method.id]}
                  title={t(`settings.signInMethods.methods.${method.id}`)}
                  value={
                    method.connected
                      ? t('settings.signInMethods.connected')
                      : t('settings.signInMethods.notConnected')
                  }
                  showChevron={false}
                  isLast={index === methods.length - 1}
                />
              ))}
            </SettingsSection>

            {canConnectFacebook ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.signInMethods.connectFacebook')}
                  accessibilityHint={t(
                    'settings.signInMethods.connectFacebookHint',
                  )}
                  accessibilityState={{ disabled: connecting, busy: connecting }}
                  disabled={connecting}
                  onPress={() => void handleConnectFacebook()}
                  style={({ pressed }) => [
                    styles.connectBtn,
                    {
                      backgroundColor: palette.primary,
                      opacity: connecting ? 0.55 : pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.connectText}>
                      {t('settings.signInMethods.connectFacebook')}
                    </Text>
                  )}
                </Pressable>
                <Text style={[styles.hint, { color: palette.textMuted }]}>
                  {t('settings.signInMethods.connectFacebookHint')}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.description, { color: palette.textSecondary }]}>
            {t('settings.signInMethods.errors.sessionChanged')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 52,
    paddingHorizontal: screenPadding.horizontal,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  headerSpacer: { width: 26 },
  description: {
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.md,
    fontSize: fontSize.sm,
  },
  actions: {
    paddingHorizontal: screenPadding.horizontal,
  },
  connectBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  connectText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
