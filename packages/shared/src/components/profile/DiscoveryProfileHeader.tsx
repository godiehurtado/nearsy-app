/**
 * Discovery Profile identity header — name / mode / zodiac + compact alignment.
 * Distance is intentionally omitted (ENH-PROFILE-01).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';

import { AlignmentScoreRing } from '../alignment/AlignmentScoreRing';
import { useTranslation } from '../../i18n';
import { zodiacSymbol, type ZodiacSign } from '../../profile/zodiacSign';
import {
  fontSize,
  fontWeight,
  spacing,
  useAppTheme,
} from '../../theme';
import {
  alignmentAccessibilityLabel,
  alignmentUnavailableLabel,
} from '../../visibility/alignmentPresentation';
import type { Alignment } from '../../visibility/discoveryCompatibility';

export type DiscoveryProfileHeaderProps = {
  displayName: string;
  modeLabel: string;
  zodiacSign: ZodiacSign | null;
  alignment: Alignment | undefined;
  /** Optional override; defaults to useTranslation().t */
  t?: TFunction;
};

export function DiscoveryProfileHeader({
  displayName,
  modeLabel,
  zodiacSign,
  alignment,
  t: tProp,
}: DiscoveryProfileHeaderProps) {
  const { palette } = useAppTheme();
  const { t: tHook } = useTranslation();
  const t = tProp ?? tHook;

  const zodiacLabel =
    zodiacSign != null ? t(`zodiac.${zodiacSign}`) : null;

  const alignmentA11y =
    alignment?.available === true
      ? alignmentAccessibilityLabel(t, alignment)
      : alignment
        ? alignmentUnavailableLabel(t, alignment.presentation)
        : undefined;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text
          style={[styles.name, { color: palette.textPrimary }]}
          accessibilityRole="header"
          numberOfLines={3}
        >
          {displayName}
        </Text>
        <Text
          style={[styles.mode, { color: palette.textSecondary }]}
          numberOfLines={1}
        >
          {modeLabel}
        </Text>
        {zodiacSign && zodiacLabel ? (
          <View
            style={styles.zodiacRow}
            accessibilityRole="text"
            accessibilityLabel={`${zodiacSymbol(zodiacSign)} ${zodiacLabel}`}
          >
            <Text style={[styles.zodiacSymbol, { color: palette.primary }]}>
              {zodiacSymbol(zodiacSign)}
            </Text>
            <Text
              style={[styles.zodiacName, { color: palette.textMuted }]}
              numberOfLines={1}
            >
              {zodiacLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {alignment ? (
        <View
          style={styles.right}
          accessibilityRole="summary"
          accessibilityLabel={alignmentA11y}
        >
          {alignment.available === true ? (
            <AlignmentScoreRing
              score={alignment.score}
              variant="compact"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : (
            <Text
              style={[styles.unavailable, { color: palette.textMuted }]}
              numberOfLines={3}
            >
              {alignmentUnavailableLabel(t, alignment.presentation)}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    width: 92,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  name: {
    fontSize: 24,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
  },
  mode: {
    marginTop: 4,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  zodiacRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zodiacSymbol: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  zodiacName: {
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  unavailable: {
    width: '100%',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
});
