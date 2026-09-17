/**
 * Explored profile identity header: name / mode / zodiac | compact Alignment.
 * Distance is intentionally omitted (ENH-PROFILE-01).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CompactAlignmentBadge } from './CompactAlignmentBadge';
import { useTranslation } from '../../i18n';
import type { DiscoveryCompatibility } from '../../visibility/discoveryCompatibility';
import type { ZodiacSign } from '../../profileContext/zodiacPresentation';
import { zodiacSymbol } from '../../profileContext/zodiacPresentation';
import {
  fontSize,
  fontWeight,
  spacing,
  useAppTheme,
} from '../../theme';

type Props = {
  displayName: string;
  modeLabel: string;
  zodiacSign: ZodiacSign | null;
  compatibility?: DiscoveryCompatibility;
};

export function DiscoveryProfileIdentityHeader({
  displayName,
  modeLabel,
  zodiacSign,
  compatibility,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const zodiacLabel = zodiacSign
    ? t(`discoveryProfile.zodiac.${zodiacSign}` as any)
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text
          style={[styles.name, { color: palette.textPrimary }]}
          accessibilityRole="header"
        >
          {displayName}
        </Text>
        <Text style={[styles.mode, { color: palette.textSecondary }]}>
          {modeLabel}
        </Text>
        {zodiacSign && zodiacLabel ? (
          <Text
            style={[styles.zodiac, { color: palette.textMuted }]}
            accessibilityLabel={zodiacLabel}
          >
            {zodiacSymbol(zodiacSign)} {zodiacLabel}
          </Text>
        ) : null}
      </View>
      <CompactAlignmentBadge compatibility={compatibility} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
  },
  mode: {
    marginTop: 4,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  zodiac: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
  },
});
