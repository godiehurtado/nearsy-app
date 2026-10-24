/**
 * Public affiliations for Profile Exploration — every affiliation inline in a wrapping
 * grid (no carousel). Compact tiles keep the CRJ logo mark (square + radius).
 * Not pressable — no approved navigation target.
 */
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
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
import { formatPublicAffiliationCaption } from '../../affiliations/affiliationPresentation';
import {
  MAX_DISCOVERY_AFFILIATIONS,
  resolveDiscoveryAffiliationGrid,
  type DiscoveryPublicAffiliation,
} from '../../visibility/discoveryAffiliations';

type Props = {
  affiliations?: readonly DiscoveryPublicAffiliation[] | null;
};

const TILE_GAP = spacing.sm;

export function DiscoveryAffiliationsCard({ affiliations }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [gridWidth, setGridWidth] = useState(0);

  const localizeTopic = (id: string, fallback: string) =>
    t(`onboarding.profileCompletion.affiliations.topics.${id}` as any, {
      defaultValue: fallback,
    });

  const items = Array.isArray(affiliations)
    ? affiliations
        .filter((a) => a?.id && (a.name || a.type))
        .slice(0, MAX_DISCOVERY_AFFILIATIONS)
    : [];

  const labeled = items.map((item) => ({
    ...item,
    caption: formatPublicAffiliationCaption(item, localizeTopic),
  }));

  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    setGridWidth((prev) => (prev === width ? prev : width));
  }, []);

  const grid = resolveDiscoveryAffiliationGrid(gridWidth, TILE_GAP);
  const tileSizeStyle = grid ? { width: grid.tileWidth } : styles.tileUnmeasured;

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
      <View style={styles.grid} onLayout={onGridLayout}>
        {labeled.map((item) => (
          <View
            key={item.id}
            style={[
              styles.tile,
              tileSizeStyle,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={item.caption}
          >
            <AffiliationLogoMark
              name={item.caption}
              type={item.type}
              logoUrl={item.logoUrl}
              size={AFFILIATION_DISCOVERY_LOGO_SIZE}
              borderRadius={AFFILIATION_DISCOVERY_LOGO_RADIUS}
            />
            <Text
              style={[styles.name, { color: palette.textPrimary }]}
              numberOfLines={2}
            >
              {item.caption}
            </Text>
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
    alignItems: 'flex-start',
  },
  tileUnmeasured: {
    width: '47%',
  },
  name: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: fontWeight.bold,
    lineHeight: 16,
  },
});
