/**
 * Compatibility card — visual shell matching Claude (ring + copy).
 * Does not invent a numeric percentage. Optional percent reserved for later.
 * Uses View rings (no react-native-svg dependency).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';
import { cardShadow } from '../../theme/shadows';

type Props = {
  /** Future real score 0–100. When absent, only the % glyph is shown (demo shell). */
  percent?: number | null;
};

const SIZE = 54;
const STROKE = 6;

export function DiscoveryCompatibilityCard({ percent }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const hasScore =
    typeof percent === 'number' &&
    Number.isFinite(percent) &&
    percent >= 0 &&
    percent <= 100;

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
      accessibilityLabel={t('discoveryProfile.compatibility')}
    >
      <View
        style={[
          styles.ring,
          {
            borderColor: palette.border,
          },
        ]}
      >
        <View
          style={[
            styles.ringAccent,
            {
              borderColor: palette.primary,
              // Demo shell: partial accent ring (not a calculated score).
              borderTopColor: hasScore ? palette.primary : palette.primary,
              borderRightColor: hasScore ? palette.primary : palette.primary,
              borderBottomColor: hasScore ? palette.primary : 'transparent',
              borderLeftColor: 'transparent',
            },
          ]}
        />
        <View style={styles.ringLabel} pointerEvents="none">
          {hasScore ? (
            <Text
              style={[styles.percentText, { color: palette.primary }]}
              accessibilityLabel={`${Math.round(percent)} percent`}
            >
              {`${Math.round(percent)}%`}
            </Text>
          ) : (
            <Text
              style={[styles.percentGlyph, { color: palette.primary }]}
              accessibilityLabel={t('discoveryProfile.compatibilityDemo')}
            >
              %
            </Text>
          )}
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          {t('discoveryProfile.compatibility')}
        </Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          {t('discoveryProfile.compatibilityBody')}
        </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: STROKE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAccent: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SIZE / 2,
    borderWidth: STROKE,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentGlyph: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
  },
  percentText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  body: {
    marginTop: 3,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
