/**
 * Shared alignment score ring — compact (Nearby) and detail (Profile).
 * True SVG circular progress (react-native-svg); no half-clip border hacks.
 * Uses primary accent neutrally; never encodes low scores as negative.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { formatAlignmentPercent } from '../../visibility/alignmentPresentation';
import { fontWeight, useAppTheme } from '../../theme';
import {
  ALIGNMENT_RING_COMPACT_SIZE,
  ALIGNMENT_RING_COMPACT_STROKE,
  ALIGNMENT_RING_DETAIL_SIZE,
  ALIGNMENT_RING_DETAIL_STROKE,
  computeAlignmentRingSvgMetrics,
} from './alignmentRingGeometry';

export type AlignmentScoreRingVariant = 'compact' | 'detail';
export {
  ALIGNMENT_RING_COMPACT_SIZE,
  ALIGNMENT_RING_COMPACT_STROKE,
  ALIGNMENT_RING_DETAIL_SIZE,
  ALIGNMENT_RING_DETAIL_STROKE,
  computeAlignmentRingGeometry,
  computeAlignmentRingSvgMetrics,
  type AlignmentRingGeometry,
  type AlignmentRingSvgMetrics,
} from './alignmentRingGeometry';

type Props = {
  score: number;
  variant: AlignmentScoreRingVariant;
  /** When set on compact rings embedded in larger tap targets. */
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
};

export function AlignmentScoreRing({
  score,
  variant,
  accessibilityElementsHidden = true,
  importantForAccessibility = 'no',
}: Props) {
  const { palette } = useAppTheme();
  const isCompact = variant === 'compact';
  const size = isCompact
    ? ALIGNMENT_RING_COMPACT_SIZE
    : ALIGNMENT_RING_DETAIL_SIZE;
  const strokeWidth = isCompact
    ? ALIGNMENT_RING_COMPACT_STROKE
    : ALIGNMENT_RING_DETAIL_STROKE;
  const fontSizePx = isCompact ? 14 : 16;
  const metrics = computeAlignmentRingSvgMetrics(size, strokeWidth, score);
  const {
    center,
    radius,
    circumference,
    strokeDashoffset,
    isEmpty,
    score: clampedScore,
  } = metrics;

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
        },
      ]}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={importantForAccessibility}
    >
      <Svg
        width={size}
        height={size}
        style={styles.svg}
        pointerEvents="none"
      >
        {/* Track first — full circumference */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={palette.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress on top — omit at 0 to avoid round-cap dot */}
        {!isEmpty ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={palette.primary}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>

      <View style={styles.label} pointerEvents="none">
        <Text
          style={[
            styles.percentText,
            isCompact ? styles.percentCompact : null,
            {
              color: palette.primary,
              fontSize: fontSizePx,
              lineHeight: fontSizePx + 2,
              maxWidth: size - strokeWidth * 2,
            },
          ]}
          maxFontSizeMultiplier={1.35}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {formatAlignmentPercent(clampedScore)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    ...StyleSheet.absoluteFillObject,
  },
  label: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
    zIndex: 1,
  },
  percentText: {
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    ...(Platform.OS === 'android'
      ? { includeFontPadding: false, textAlignVertical: 'center' as const }
      : null),
  },
  percentCompact: {
    fontWeight: fontWeight.semibold,
  },
});
