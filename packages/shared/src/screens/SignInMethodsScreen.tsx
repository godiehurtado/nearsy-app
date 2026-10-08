/**
 * Settings — Sign-in methods (linked providers + explicit "Connect Google /
 * Apple / Facebook"). State comes only from Firebase `providerData`; no unlink
 * is offered.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsSection } from '../components/settings/SettingsSection';
import {
  buildSignInMethodRows,
  createFirebaseJsAccountLinkingAdapter,
  type LinkableProvider,
  type SignInMethodId,
  type SignInMethodRow,
} from '../authentication/social';
import { useConnectProviderFlow } from '../hooks/useConnectProviderFlow';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';

const accountLinking = createFirebaseJsAccountLinkingAdapter();

const readProviderIds = (): readonly string[] =>
  accountLinking.getCurrentAccount()?.providerIds ?? [];

const METHOD_ICONS: Record<SignInMethodId, React.ComponentProps<typeof Ionicons>['name']> = {
  password: 'mail-outline',
  'google.com': 'logo-google',
  'apple.com': 'logo-apple',
  'facebook.com': 'logo-facebook',
};

const CONNECT_LABEL_KEYS: Record<LinkableProvider, string> = {
  google: 'settings.signInMethods.connectGoogle',
  apple: 'settings.signInMethods.connectApple',
  facebook: 'settings.signInMethods.connectFacebook',
};

export default function SignInMethodsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [providerIds, setProviderIds] = useState<readonly string[]>(readProviderIds);
  const refresh = useCallback(() => setProviderIds(readProviderIds()), []);

  useFocusEffect(refresh);

  const { connectProvider, connectingProvider } = useConnectProviderFlow(refresh);
  const rows = useMemo(() => buildSignInMethodRows(providerIds), [providerIds]);
  const canConnect = Platform.OS === 'ios';
  const anyConnecting = connectingProvider !== null;

  const renderConnectRow = (
    row: SignInMethodRow,
    provider: LinkableProvider,
    isLast: boolean,
  ) => {
    const connecting = connectingProvider === provider;
    const label = t(CONNECT_LABEL_KEYS[provider] as any);
    return (
      <View
        key={row.id}
        style={[
          styles.row,
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <View
          style={[
            styles.iconChip,
            { backgroundColor: palette.chipBg, borderColor: palette.border },
          ]}
        >
          <Ionicons name={METHOD_ICONS[row.id]} size={18} color={palette.chipText} />
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {t(row.labelKey as any)}
          </Text>
          <Text style={[styles.value, { color: palette.textSecondary }]}>
            {t('settings.signInMethods.notLinkedLabel')}
          </Text>
        </View>
        {canConnect ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: anyConnecting, busy: connecting }}
            disabled={anyConnecting}
            onPress={() => void connectProvider(provider)}
            style={({ pressed }) => [
              styles.connectBtn,
              {
                backgroundColor: palette.primary,
                opacity: anyConnecting ? 0.6 : pressed ? 0.88 : 1,
              },
            ]}
          >
            {connecting ? (
              <ActivityIndicator
                size="small"
                color="#fff"
                accessibilityLabel={t('settings.signInMethods.connecting')}
              />
            ) : (
              <Text style={styles.connectText}>{label}</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

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
        <Text
          style={[
            styles.description,
            { color: palette.textSecondary, paddingHorizontal: screenPadding.horizontal },
          ]}
        >
          {t('settings.signInMethods.description')}
        </Text>

        <SettingsSection title={t('settings.signInMethods.title')}>
          {rows.map((row, index) => {
            const isLast = index === rows.length - 1;
            if (row.connectProvider) return renderConnectRow(row, row.connectProvider, isLast);
            return (
              <SettingsRow
                key={row.id}
                icon={METHOD_ICONS[row.id]}
                title={t(row.labelKey as any)}
                value={t('settings.signInMethods.linkedLabel')}
                showChevron={false}
                isLast={isLast}
              />
            );
          })}
        </SettingsSection>

        <Text
          style={[
            styles.note,
            { color: palette.textMuted, paddingHorizontal: screenPadding.horizontal },
          ]}
        >
          {t('settings.signInMethods.limitationNote')}
        </Text>
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
  note: {
    fontSize: fontSize.xs,
    marginTop: -spacing.sm,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  value: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  connectBtn: {
    minHeight: 36,
    minWidth: 112,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
