/**
 * Compatibility card — ring + localized match score or unavailable copy.
 * Score comes from backend only; iOS never recalculates.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n';
import type { DiscoveryCompatibility } from '../../visibility/discoveryCompatibility';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';
import { cardShadow } from '../../theme/shadows';

type Props = {
  /** Absent during rollout — card hidden (least intrusive for older backends). */
  compatibility?: DiscoveryCompatibility;
};

const SIZE = 54;
const STROKE = 6;

export function DiscoveryCompatibilityCard({ compatibility }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  if (!compatibility) {
    return null;
  }

  if (compatibility.available) {
    const score = compatibility.score;
    const matchLabel = t('discoveryProfile.compatibilityMatch', { score });
    const a11yLabel = t('discoveryProfile.a11yCompatibilityMatch', { score });

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
        accessibilityLabel={a11yLabel}
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
                borderTopColor: palette.primary,
                borderRightColor: palette.primary,
                borderBottomColor: palette.primary,
                borderLeftColor: 'transparent',
              },
            ]}
          />
          <View style={styles.ringLabel} pointerEvents="none">
            <Text
              style={[styles.percentText, { color: palette.primary }]}
              maxFontSizeMultiplier={1.5}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {`${score}%`}
            </Text>
          </View>
        </View>
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: palette.textPrimary }]}
            maxFontSizeMultiplier={1.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {matchLabel}
          </Text>
          <Text
            style={[styles.body, { color: palette.textSecondary }]}
            maxFontSizeMultiplier={1.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {t('discoveryProfile.compatibilityBody')}
          </Text>
        </View>
      </View>
    );
  }

  const unavailableCopy = t('discoveryProfile.compatibilityUnavailable');

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
      accessibilityLabel={unavailableCopy}
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
            styles.ringInner,
            { backgroundColor: palette.background },
          ]}
        />
      </View>
      <View style={styles.copy}>
        <Text
          style={[styles.title, { color: palette.textPrimary }]}
          maxFontSizeMultiplier={1.5}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {t('discoveryProfile.compatibility')}
        </Text>
        <Text
          style={[styles.body, { color: palette.textSecondary }]}
          maxFontSizeMultiplier={1.5}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {unavailableCopy}
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
  ringInner: {
    width: SIZE - STROKE * 2,
    height: SIZE - STROKE * 2,
    borderRadius: (SIZE - STROKE * 2) / 2,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    flexShrink: 1,
  },
  body: {
    marginTop: 3,
    fontSize: fontSize.sm,
    lineHeight: 20,
    flexShrink: 1,
  },
});
