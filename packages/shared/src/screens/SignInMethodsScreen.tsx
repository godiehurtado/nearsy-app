/**
 * Settings — Sign-in methods (ENH-AUTH-LINK-01, Android).
 * Methods come from Firebase providerData (+ LinkedIn UID contract) only.
 * The only authorized place to link Google or Facebook to the signed-in
 * account. One linking attempt at a time across providers. No unlink.
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
  createExclusiveLinkRunner,
  type AccountLinkErrorCode,
  type AccountLinkUserSnapshot,
} from '../authentication/accountLinking/accountLinkingCore';
import {
  hasFacebookLinked,
  messageKeyForFacebookLinkError,
} from '../authentication/facebook/facebookAccountLinking';
import {
  hasGoogleLinked,
  messageKeyForGoogleLinkError,
} from '../authentication/google/googleAccountLinking';
import {
  resolveSignInMethods,
  type SignInMethodId,
} from '../authentication/signInMethods';
import { isNearsyFacebookAuthConfigured } from '../config/facebookAuthConfig';
import {
  getAccountLinkUserSnapshot,
  reloadAccountLinkUser,
} from '../services/accountLinkSession';
import { createFacebookAccountLinker } from '../services/facebookAccountLinking';
import {
  createGoogleAccountLinker,
  isGoogleAccountLinkingConfigured,
} from '../services/googleAccountLinking';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';

type LinkProvider = 'google' | 'facebook';

const LINK_PROVIDERS: readonly LinkProvider[] = ['google', 'facebook'];

const METHOD_ICONS: Record<
  SignInMethodId,
  React.ComponentProps<typeof Ionicons>['name']
> = {
  email: 'mail-outline',
  google: 'logo-google',
  facebook: 'logo-facebook',
  linkedin: 'logo-linkedin',
};

const PROVIDER_COPY: Record<
  LinkProvider,
  {
    connect: string;
    connectHint: string;
    confirmTitle: string;
    confirmBody: string;
    linkedTitle: string;
    linkedBody: string;
    errorTitle: string;
  }
> = {
  google: {
    connect: 'settings.signInMethods.connectGoogle',
    connectHint: 'settings.signInMethods.connectGoogleHint',
    confirmTitle: 'settings.signInMethods.confirmGoogleTitle',
    confirmBody: 'settings.signInMethods.confirmGoogleBody',
    linkedTitle: 'settings.signInMethods.googleLinkedTitle',
    linkedBody: 'settings.signInMethods.googleLinkedBody',
    errorTitle: 'settings.signInMethods.errors.googleTitle',
  },
  facebook: {
    connect: 'settings.signInMethods.connectFacebook',
    connectHint: 'settings.signInMethods.connectFacebookHint',
    confirmTitle: 'settings.signInMethods.confirmFacebookTitle',
    confirmBody: 'settings.signInMethods.confirmFacebookBody',
    linkedTitle: 'settings.signInMethods.facebookLinkedTitle',
    linkedBody: 'settings.signInMethods.facebookLinkedBody',
    errorTitle: 'settings.signInMethods.errors.facebookTitle',
  },
};

const ERROR_MESSAGE_KEY: Record<
  LinkProvider,
  (code: AccountLinkErrorCode) => string
> = {
  google: messageKeyForGoogleLinkError,
  facebook: messageKeyForFacebookLinkError,
};

function canConnect(
  provider: LinkProvider,
  user: AccountLinkUserSnapshot | null,
): boolean {
  if (!user) return false;
  return provider === 'google'
    ? !hasGoogleLinked(user) && isGoogleAccountLinkingConfigured()
    : !hasFacebookLinked(user) && isNearsyFacebookAuthConfigured();
}

export default function SignInMethodsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [user, setUser] = useState<AccountLinkUserSnapshot | null>(() =>
    getAccountLinkUserSnapshot(),
  );
  const [connecting, setConnecting] = useState<LinkProvider | null>(null);
  const linkRunner = useRef(createExclusiveLinkRunner<LinkProvider>()).current;

  useEffect(() => {
    let active = true;
    reloadAccountLinkUser()
      .then((snapshot) => {
        if (active) setUser(snapshot);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const confirmConnect = useCallback(
    (provider: LinkProvider) =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          t(PROVIDER_COPY[provider].confirmTitle),
          t(PROVIDER_COPY[provider].confirmBody),
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

  const linkers = useMemo(
    () => ({
      google: createGoogleAccountLinker(() => confirmRef.current('google')),
      facebook: createFacebookAccountLinker(() => confirmRef.current('facebook')),
    }),
    [],
  );

  const handleConnect = useCallback(
    async (provider: LinkProvider) => {
      const outcome = await linkRunner.run(provider, async () => {
        setConnecting(provider);
        try {
          return await linkers[provider]();
        } finally {
          setConnecting(null);
        }
      });
      if (outcome.status === 'ignored') return;
      const copy = PROVIDER_COPY[provider];
      if (outcome.status === 'linked' || outcome.status === 'alreadyLinked') {
        setUser((prev) =>
          prev ? { uid: prev.uid, providerIds: outcome.providerIds } : prev,
        );
        Alert.alert(t(copy.linkedTitle), t(copy.linkedBody));
        return;
      }
      setUser(getAccountLinkUserSnapshot());
      if (outcome.status === 'failed') {
        Alert.alert(
          t(copy.errorTitle),
          t(ERROR_MESSAGE_KEY[provider](outcome.code)),
        );
      }
    },
    [linkRunner, linkers, t],
  );

  const methods = resolveSignInMethods(user);
  const connectable = LINK_PROVIDERS.filter((provider) =>
    canConnect(provider, user),
  );

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

            {connectable.map((provider) => {
              const copy = PROVIDER_COPY[provider];
              const busy = connecting === provider;
              const locked = connecting !== null;
              return (
                <View key={provider} style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(copy.connect)}
                    accessibilityHint={t(copy.connectHint)}
                    accessibilityState={{ disabled: locked, busy }}
                    disabled={locked}
                    onPress={() => void handleConnect(provider)}
                    style={({ pressed }) => [
                      styles.connectBtn,
                      {
                        backgroundColor: palette.primary,
                        opacity: locked ? 0.55 : pressed ? 0.88 : 1,
                      },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.connectText}>{t(copy.connect)}</Text>
                    )}
                  </Pressable>
                  <Text style={[styles.hint, { color: palette.textMuted }]}>
                    {t(copy.connectHint)}
                  </Text>
                </View>
              );
            })}
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
    marginBottom: spacing.lg,
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
