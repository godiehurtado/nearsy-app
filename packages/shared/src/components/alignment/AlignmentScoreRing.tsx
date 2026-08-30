/**
 * Shared alignment score ring — compact (Nearby) and detail (Profile).
 * Geometrically circular progress via clipped half-rings (no SVG dependency).
 * Uses primary accent neutrally; never encodes low scores as negative.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { formatAlignmentPercent } from '../../visibility/alignmentPresentation';
import { fontWeight, useAppTheme } from '../../theme';

export type AlignmentScoreRingVariant = 'compact' | 'detail';

/** Fixed square sizes — do not flex or scale with Dynamic Type. */
export const ALIGNMENT_RING_DETAIL_SIZE = 76;
export const ALIGNMENT_RING_COMPACT_SIZE = 56;
export const ALIGNMENT_RING_DETAIL_STROKE = 7;
export const ALIGNMENT_RING_COMPACT_STROKE = 5;

type Props = {
  score: number;
  variant: AlignmentScoreRingVariant;
  /** When set on compact rings embedded in larger tap targets. */
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
};

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Progress arc: two overflow-clipped half-circles, same center/radius as track.
 * Container is rotated -90deg so progress starts at 12 o'clock.
 */
function ProgressArc({
  size,
  stroke,
  progress,
  color,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
}) {
  if (progress <= 0) {
    return null;
  }

  const half = size / 2;
  const degrees = (progress / 100) * 360;
  const firstHalf = Math.min(degrees, 180);
  const secondHalf = Math.max(degrees - 180, 0);

  const fullRing = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: stroke,
    borderColor: color,
  };

  return (
    <View
      style={[styles.progressRoot, { width: size, height: size }]}
      pointerEvents="none"
    >
      {/* First 0–50%: right half-clip */}
      <View style={[styles.halfClip, { width: half, height: size, left: half }]}>
        <View
          style={[
            fullRing,
            styles.absolute,
            {
              left: -half,
              transform: [{ rotate: `${firstHalf - 180}deg` }],
            },
          ]}
        />
      </View>

      {/* Second 50–100%: left half-clip */}
      {degrees > 180 ? (
        <View style={[styles.halfClip, { width: half, height: size, left: 0 }]}>
          <View
            style={[
              fullRing,
              styles.absolute,
              {
                left: 0,
                transform: [{ rotate: `${secondHalf - 180}deg` }],
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
  const fontSizePx = isCompact ? 12 : 16;
  const progress = clampScore(score);
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
      {/* Track — same center and radius as progress */}
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
        progress={progress}
        color={palette.primary}
      />

      {/* Label centered in the fixed square — outside arc rotation */}
      <View style={styles.label} pointerEvents="none">
        <Text
          style={[
            styles.percentText,
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
          minimumFontScale={0.7}
        >
          {formatAlignmentPercent(progress)}
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
  track: {
    ...StyleSheet.absoluteFillObject,
  },
  progressRoot: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ rotate: '-90deg' }],
  },
  halfClip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  absolute: {
    position: 'absolute',
    top: 0,
  },
  label: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  percentText: {
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    ...(Platform.OS === 'android'
      ? { includeFontPadding: false, textAlignVertical: 'center' as const }
      : null),
  },
});
