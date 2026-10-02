/**
 * Profile Exploration — read-only Interests of the explored profile.
 * Opened from DiscoveryProfileScreen with resolved catalog interest IDs only;
 * no fetch, no editing.
 */
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useTranslation } from '../i18n';
import { useInterestItemTranslator } from '../hooks/useInterestItemTranslator';
import { InterestChip } from '../components/InterestChip';
import { fontSize, fontWeight, radius, spacing, useAppTheme } from '../theme';
import { cardShadow } from '../theme/shadows';
import { readDiscoveryInterestIds, resolveInterestChips } from '../visibility';

export default function DiscoveryInterestsScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'DiscoveryInterests'>>();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { palette, theme } = useAppTheme();
  const { t } = useTranslation();
  const translateItem = useInterestItemTranslator();

  const interestPills = useMemo(
    () =>
      resolveInterestChips(
        readDiscoveryInterestIds(route.params),
        translateItem,
      ),
    [route.params, translateItem],
  );

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: palette.background, paddingTop: insets.top },
      ]}
    >
      <StatusBar
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('discoveryProfile.a11yBack')}
          style={[
            styles.backCircle,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
        </Pressable>
        <Text
          style={[styles.title, { color: palette.textPrimary }]}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {t('discoveryProfile.interests')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
      >
        {interestPills.length > 0 ? (
          <View
            style={[
              styles.card,
              { backgroundColor: palette.panel, borderColor: palette.border },
              cardShadow,
            ]}
          >
            <View style={styles.pillsRow}>
              {interestPills.map((chip) => (
                <InterestChip
                  key={chip.id}
                  name={chip.label}
                  icon={chip.icon}
                  iconColor={chip.iconColor}
                  selected={false}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
  headerSpacer: { width: 36 },
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
