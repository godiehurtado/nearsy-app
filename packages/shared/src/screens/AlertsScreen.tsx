/**
 * Alerts — discoverNearby only; opens DiscoveryProfile (no peer user docs).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { RootTabsParamList } from '../navigation/RootTabs';
import { registerPushToken } from '../services/pushTokens';
import { useNearbyAlerts, type AlertItem } from '../hooks/useNearbyAlerts';
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
  buildAlertRowMessage,
  formatAlertDistance,
  formatAlertRelativeTime,
  NOTIFICATION_AVATAR_SIZE,
} from './alertsPresentation';

export default function AlertsScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabsParamList>>();
  const { loading, alerts, me, refresh } = useNearbyAlerts();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const translateItem = useCallback(
    (nameKey: string, fallback: string) =>
      t(`onboarding.profileCompletion.interests.items.${nameKey}` as any, {
        defaultValue: fallback,
      }),
    [t],
  );

  useEffect(() => {
    registerPushToken().catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const inactive = !me?.visibility;

  const rowMessage = useCallback(
    (item: AlertItem) => buildAlertRowMessage(item, t, translateItem),
    [t, translateItem],
  );

  const listBottomPad = useMemo(
    () => 96 + insets.bottom,
    [insets.bottom],
  );

  const openDiscoveryProfile = useCallback(
    (uid: string | undefined) => {
      if (!uid) return;
      navigation.navigate('Home', {
        screen: 'DiscoveryProfile',
        params: { uid },
      });
    },
    [navigation],
  );

  if (loading) {
    return (
      <View
        style={[styles.centered, { backgroundColor: palette.background }]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('notifications.loading')}
      >
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
          {t('notifications.loading')}
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: AlertItem }) => {
    const message = rowMessage(item);
    const distanceLabel = formatAlertDistance(item.distanceFt, t);
    const timeLabel = formatAlertRelativeTime(item.at, Date.now(), t);

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={message}
        onPress={() => openDiscoveryProfile(item.uid)}
        style={({ pressed }) => [
          styles.row,
          { opacity: pressed ? 0.88 : 1 },
        ]}
      >
        {item.avatar ? (
          <Image
            source={{ uri: item.avatar }}
            style={[
              styles.avatar,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarPlaceholder,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="person" size={18} color={palette.textMuted} />
          </View>
        )}

        <View style={styles.textCol}>
          <Text
            style={[styles.message, { color: palette.textPrimary }]}
            numberOfLines={2}
          >
            {message}
          </Text>
          {distanceLabel ? (
            <Text style={[styles.distance, { color: palette.textMuted }]}>
              {distanceLabel}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.time, { color: palette.textMuted }]}>
          {timeLabel}
        </Text>
      </Pressable>
    );
  };

  const emptyContent = inactive ? (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyIcon,
          {
            backgroundColor: palette.panel,
            borderColor: palette.border,
          },
        ]}
      >
        <Ionicons
          name="eye-off-outline"
          size={22}
          color={palette.textMuted}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
        {t('notifications.inactive.title')}
      </Text>
      <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>
        {t('notifications.inactive.body')}
      </Text>
    </View>
  ) : (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyIcon,
          {
            backgroundColor: palette.panel,
            borderColor: palette.border,
          },
        ]}
      >
        <Ionicons
          name="notifications-outline"
          size={22}
          color={palette.textMuted}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
        {t('notifications.empty.title')}
      </Text>
      <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>
        {t('notifications.empty.body')}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        }
        ListHeaderComponent={
          <View
            style={[
              styles.header,
              { paddingTop: insets.top + spacing.md },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.screenTitle, { color: palette.textPrimary }]}
            >
              {t('notifications.title')}
            </Text>
            {inactive ? (
              <View
                style={[
                  styles.inactiveBanner,
                  {
                    backgroundColor: palette.chipBg,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[styles.inactiveBannerText, { color: palette.chipText }]}
                >
                  {t('notifications.inactive.body')}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => (
          <View
            style={[
              styles.separator,
              {
                backgroundColor: palette.border,
                marginLeft:
                  screenPadding.horizontal +
                  NOTIFICATION_AVATAR_SIZE +
                  spacing.md,
              },
            ]}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: listBottomPad,
            flexGrow: 1,
          },
        ]}
        ListEmptyComponent={emptyContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPadding.horizontal,
  },
  loadingText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: screenPadding.horizontal,
    paddingBottom: spacing.md,
  },
  screenTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    marginBottom: spacing.sm,
  },
  inactiveBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inactiveBannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.sm * 1.45,
  },
  listContent: {
    paddingTop: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: screenPadding.horizontal,
    paddingVertical: spacing.sm + 2,
    minHeight: 56,
  },
  avatar: {
    width: NOTIFICATION_AVATAR_SIZE,
    height: NOTIFICATION_AVATAR_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
    paddingTop: 1,
  },
  message: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.base * 1.35,
  },
  distance: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  time: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    minWidth: 28,
    textAlign: 'right',
    paddingTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding.horizontal,
    paddingTop: spacing.xxxl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    lineHeight: fontSize.base * 1.45,
  },
});
