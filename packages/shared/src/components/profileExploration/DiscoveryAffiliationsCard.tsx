/**
 * Public affiliations carousel for Profile Exploration.
 * Logo mark matches CRJ selected-affiliation presentation (square + radius 18).
 * Not pressable — no approved navigation target.
 */
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AffiliationLogoMark } from '../../affiliations/AffiliationLogoMark';
import {
  AFFILIATION_SELECTED_LOGO_RADIUS,
  AFFILIATION_SELECTED_LOGO_SIZE,
} from '../../affiliations/affiliationLogo';
import { useTranslation } from '../../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';
import { cardShadow } from '../../theme/shadows';
import {
  formatDiscoveryAffiliationTypeLabel,
  type DiscoveryPublicAffiliation,
} from '../../visibility/discoveryAffiliations';

type Props = {
  affiliations?: readonly DiscoveryPublicAffiliation[] | null;
};

export function DiscoveryAffiliationsCard({ affiliations }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const items = Array.isArray(affiliations)
    ? affiliations.filter((a) => a?.id && a?.name)
    : [];

  const translateCategory = useCallback(
    (nameKey: string, fallback: string) =>
      t(
        `onboarding.profileCompletion.affiliations.categories.${nameKey}` as any,
        { defaultValue: fallback },
      ),
    [t],
  );

  const labeled = useMemo(
    () =>
      items.map((item) => ({
        item,
        typeLabel: formatDiscoveryAffiliationTypeLabel(
          item.type,
          translateCategory,
        ),
      })),
    [items, translateCategory],
  );

  if (labeled.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.panel,
          borderColor: palette.border,
        },
        cardShadow,
      ]}
      accessibilityRole="summary"
      accessibilityLabel={t('discoveryProfile.affiliations')}
    >
      <Text style={[styles.title, { color: palette.textMuted }]}>
        {t('discoveryProfile.affiliations')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {labeled.map(({ item, typeLabel }) => (
          <View
            key={item.id}
            style={[
              styles.tile,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={
              typeLabel ? `${item.name}, ${typeLabel}` : item.name
            }
          >
            <AffiliationLogoMark
              name={item.name}
              type={item.type}
              logoUrl={item.logoUrl}
              size={AFFILIATION_SELECTED_LOGO_SIZE}
              borderRadius={AFFILIATION_SELECTED_LOGO_RADIUS}
            />
            <View style={styles.copy}>
              <Text
                style={[styles.name, { color: palette.textPrimary }]}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              {typeLabel ? (
                <Text
                  style={[styles.type, { color: palette.textSecondary }]}
                  numberOfLines={1}
                >
                  {typeLabel}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingLeft: spacing.lg,
  },
  title: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    paddingRight: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  tile: {
    width: 220,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    lineHeight: 16,
  },
  type: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    lineHeight: 14,
  },
});
