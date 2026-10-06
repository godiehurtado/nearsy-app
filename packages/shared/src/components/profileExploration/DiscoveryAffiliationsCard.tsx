/**
 * Public affiliations for Profile Exploration — every affiliation inline in a
 * wrap grid (~2 per row), no horizontal carousel.
 * Logo mark reuses the CRJ square presentation at a compact Discovery size.
 * Not pressable — no approved navigation target.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
} from 'react-native';

import { AffiliationLogoMark } from '../../affiliations/AffiliationLogoMark';
import {
  AFFILIATION_DISCOVERY_LOGO_RADIUS,
  AFFILIATION_DISCOVERY_LOGO_SIZE,
} from '../../affiliations/affiliationLogo';
import { useTranslation } from '../../i18n';
import {
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
import { resolveDiscoveryAffiliationTileWidth } from './discoveryAffiliationsLayout';

type Props = {
  affiliations?: readonly DiscoveryPublicAffiliation[] | null;
};

const TILE_GAP = spacing.sm;
const UNMEASURED_TILE_WIDTH: DimensionValue = '47%';

export function DiscoveryAffiliationsCard({ affiliations }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [gridWidth, setGridWidth] = useState(0);

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

  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setGridWidth((prev) => (prev === next ? prev : next));
  }, []);

  if (labeled.length === 0) return null;

  const tileWidth =
    resolveDiscoveryAffiliationTileWidth(gridWidth, TILE_GAP) ??
    UNMEASURED_TILE_WIDTH;

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
      <View style={styles.grid} onLayout={onGridLayout}>
        {labeled.map(({ item, typeLabel }) => (
          <View
            key={item.id}
            style={[
              styles.tile,
              {
                width: tileWidth,
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
              size={AFFILIATION_DISCOVERY_LOGO_SIZE}
              borderRadius={AFFILIATION_DISCOVERY_LOGO_RADIUS}
            />
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
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  title: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  name: {
    marginTop: spacing.sm,
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
