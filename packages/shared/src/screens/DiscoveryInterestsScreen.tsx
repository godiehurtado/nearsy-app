/**
 * Profile Exploration — read-only Interests of a discovered profile.
 * Renders the interest IDs handed over by DiscoveryProfile (no refetch).
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { HomeStackParamList } from '../navigation/HomeStack';
import { useTranslation } from '../i18n';
import { InterestChip } from '../components/InterestChip';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';
import { cardShadow } from '../theme/shadows';
import { resolveInterestChips } from '../visibility/interestDisplay';

export default function DiscoveryInterestsScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'DiscoveryInterests'>>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const interestIds = route.params?.interestIds;

  const translateItem = useCallback(
    (nameKey: string, fallback: string) =>
      t(`onboarding.profileCompletion.interests.items.${nameKey}` as any, {
        defaultValue: fallback,
      }),
    [t],
  );

  const interestPills = useMemo(
    () => resolveInterestChips(interestIds ?? [], translateItem),
    [interestIds, translateItem],
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
          accessibilityLabel={t('discoveryProfile.a11yBack')}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={palette.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: palette.textPrimary }]}
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
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
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
