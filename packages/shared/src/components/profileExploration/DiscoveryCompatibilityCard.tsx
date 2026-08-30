/**
 * Profile Exploration — Alignment card (wire field remains `compatibility`).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlignmentScoreRing } from '../alignment/AlignmentScoreRing';
import { useTranslation } from '../../i18n';
import {
  alignmentAccessibilityLabel,
  alignmentTierLabel,
  alignmentTitleLabel,
  alignmentUnavailableLabel,
} from '../../visibility/alignmentPresentation';
import {
  toAlignment,
  type DiscoveryCompatibility,
} from '../../visibility/discoveryCompatibility';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';
import { cardShadow } from '../../theme/shadows';

type Props = {
  /** Wire compatibility — absent during rollout hides the card. */
  compatibility?: DiscoveryCompatibility;
};

export function DiscoveryCompatibilityCard({ compatibility }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const alignment = toAlignment(compatibility);

  if (!alignment) {
    return null;
  }

  if (alignment.available) {
    const a11yLabel = alignmentAccessibilityLabel(t, alignment);
    const tierLabel = alignment.tier
      ? alignmentTierLabel(t, alignment.tier)
      : null;

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
        <AlignmentScoreRing score={alignment.score} variant="detail" />
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: palette.textPrimary }]}
            maxFontSizeMultiplier={1.5}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {alignmentTitleLabel(t)}
          </Text>
          {tierLabel ? (
            <Text
              style={[styles.body, { color: palette.textSecondary }]}
              maxFontSizeMultiplier={1.5}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {tierLabel}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const unavailableCopy = alignmentUnavailableLabel(t);

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
          styles.ringPlaceholder,
          {
            borderColor: palette.border,
            backgroundColor: palette.background,
          },
        ]}
      />
      <View style={styles.copy}>
        <Text
          style={[styles.title, { color: palette.textPrimary }]}
          maxFontSizeMultiplier={1.5}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {alignmentTitleLabel(t)}
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

const PLACEHOLDER = 54;

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
  ringPlaceholder: {
    width: PLACEHOLDER,
    height: PLACEHOLDER,
    borderRadius: PLACEHOLDER / 2,
    borderWidth: 6,
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
