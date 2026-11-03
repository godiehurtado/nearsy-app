/**
 * Shared alignment score ring — compact (Nearby) and detail (Profile).
 * Pure React Native Views (two semicircle half-clips). Avoids react-native-svg
 * so Dev Clients / Android builds without RNSVG native do not show the red
 * “Unimplemented” box. Score % uses the same clamp + formatAlignmentPercent.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { formatAlignmentPercent } from '../../visibility/alignmentPresentation';
import { fontWeight, useAppTheme } from '../../theme';
import {
  ALIGNMENT_RING_COMPACT_SIZE,
  ALIGNMENT_RING_COMPACT_STROKE,
  ALIGNMENT_RING_DETAIL_SIZE,
  ALIGNMENT_RING_DETAIL_STROKE,
  computeAlignmentRingGeometry,
  type AlignmentRingGeometry,
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

/**
 * Extra clip room past the ring square. Owner reported bottom flattening on
 * compact ~83% rings; halfClip overflow:hidden flush to the stroke edge is the
 * leading hypothesis (not device-confirmed). Bleed keeps the View technique
 * without introducing a native SVG dependency. Physical QA still required.
 */
const HALF_CLIP_BLEED = 1;

/**
 * Two half-clips + 180° semicircle borders (not a full colored ring).
 * Outer -90deg starts the arc at 12 o'clock; positive rotation is clockwise.
 */
function ProgressArc({
  size,
  stroke,
  geometry,
  color,
}: {
  size: number;
  stroke: number;
  geometry: AlignmentRingGeometry;
  color: string;
}) {
  if (geometry.isEmpty || geometry.totalDegrees <= 0) {
    return null;
  }

  const half = size / 2;
  const { firstHalfDegrees, secondHalfDegrees, isFull } = geometry;
  const clipHeight = size + HALF_CLIP_BLEED * 2;

  const semiBase = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: stroke,
    borderColor: 'transparent' as const,
    position: 'absolute' as const,
    top: HALF_CLIP_BLEED,
  };

  return (
    <View
      style={[styles.progressRoot, { width: size, height: size }]}
      pointerEvents="none"
      {...(isFull ? { testID: 'alignment-ring-progress-full' } : null)}
    >
      {/* First 0–50%: right half-clip, max 180° via top+right semicircle */}
      <View
        style={[
          styles.halfClip,
          {
            width: half + HALF_CLIP_BLEED,
            height: clipHeight,
            left: half,
            top: -HALF_CLIP_BLEED,
          },
        ]}
        collapsable={false}
      >
        <View
          style={[
            semiBase,
            {
              left: -half,
              borderTopColor: color,
              borderRightColor: color,
              transform: [{ rotate: `${firstHalfDegrees - 180}deg` }],
            },
          ]}
        />
      </View>

      {/* Second 50–100%: left half-clip paints only the excess over 180° */}
      {secondHalfDegrees > 0 ? (
        <View
          style={[
            styles.halfClip,
            {
              width: half + HALF_CLIP_BLEED,
              height: clipHeight,
              left: -HALF_CLIP_BLEED,
              top: -HALF_CLIP_BLEED,
            },
          ]}
          collapsable={false}
        >
          <View
            style={[
              semiBase,
              {
                left: HALF_CLIP_BLEED,
                borderBottomColor: color,
                borderLeftColor: color,
                transform: [{ rotate: `${secondHalfDegrees - 180}deg` }],
              },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

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
  const stroke = isCompact
    ? ALIGNMENT_RING_COMPACT_STROKE
    : ALIGNMENT_RING_DETAIL_STROKE;
  const fontSizePx = isCompact ? 14 : 16;
  const geometry = computeAlignmentRingGeometry(score);
  const half = size / 2;

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
      {/* Track — full 360°, same center/radius/stroke as progress */}
      <View
        style={[
          styles.track,
          {
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: stroke,
            borderColor: palette.border,
          },
        ]}
        pointerEvents="none"
      />

      <ProgressArc
        size={size}
        stroke={stroke}
        geometry={geometry}
        color={palette.primary}
      />

      {/* Label centered in the fixed square — outside arc rotation */}
      <View style={styles.label} pointerEvents="none">
        <Text
          style={[
            styles.percentText,
            isCompact ? styles.percentCompact : null,
            {
              color: palette.primary,
              fontSize: fontSizePx,
              lineHeight: fontSizePx + 2,
              maxWidth: size - stroke * 2,
            },
          ]}
          maxFontSizeMultiplier={1.35}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {formatAlignmentPercent(geometry.score)}
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
    overflow: 'visible',
  },
  track: {
    ...StyleSheet.absoluteFillObject,
  },
  progressRoot: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  halfClip: {
    position: 'absolute',
    overflow: 'hidden',
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
