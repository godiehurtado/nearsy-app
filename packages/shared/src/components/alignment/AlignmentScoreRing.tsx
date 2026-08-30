/**
 * Shared alignment score ring — compact (Nearby) and detail (Profile).
 * Uses primary accent neutrally; never encodes low scores as negative.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatAlignmentPercent } from '../../visibility/alignmentPresentation';
import { fontWeight, useAppTheme } from '../../theme';

export type AlignmentScoreRingVariant = 'compact' | 'detail';

type Props = {
  score: number;
  variant: AlignmentScoreRingVariant;
  /** When set on compact rings embedded in larger tap targets. */
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
};

const DETAIL_SIZE = 54;
const DETAIL_STROKE = 6;
const COMPACT_SIZE = 40;
const COMPACT_STROKE = 4;

export function AlignmentScoreRing({
  score,
  variant,
  accessibilityElementsHidden = true,
  importantForAccessibility = 'no',
}: Props) {
  const { palette } = useAppTheme();
  const isCompact = variant === 'compact';
  const size = isCompact ? COMPACT_SIZE : DETAIL_SIZE;
  const stroke = isCompact ? COMPACT_STROKE : DETAIL_STROKE;
  const fontSize = isCompact ? 11 : 14;

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.ringAccent,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
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
          style={[
            styles.percentText,
            {
              color: palette.primary,
              fontSize,
              maxWidth: size - stroke * 2,
            },
          ]}
          maxFontSizeMultiplier={1.5}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          accessibilityElementsHidden={accessibilityElementsHidden}
          importantForAccessibility={importantForAccessibility}
        >
          {formatAlignmentPercent(score)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAccent: {
    ...StyleSheet.absoluteFillObject,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  percentText: {
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
});
