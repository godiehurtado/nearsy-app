/**
 * Compact Alignment badge for explored profile header (ENH-PROFILE-01).
 * Preserves BUG-ALIGN-01 reason → state mapping; never shows raw reason codes.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AlignmentScoreRing,
  ALIGNMENT_RING_COMPACT_SIZE,
} from '../alignment/AlignmentScoreRing';
import { useTranslation } from '../../i18n';
import {
  alignmentAccessibilityLabel,
  alignmentTitleLabel,
  alignmentUnavailableLabel,
} from '../../visibility/alignmentPresentation';
import {
  toAlignment,
  type DiscoveryCompatibility,
} from '../../visibility/discoveryCompatibility';
import { useAppTheme } from '../../theme';

type Props = {
  compatibility?: DiscoveryCompatibility;
};

export function CompactAlignmentBadge({ compatibility }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const alignment = toAlignment(compatibility);

  if (!alignment) {
    return null;
  }

  if (alignment.available === false) {
    const copy = alignmentUnavailableLabel(t, alignment.state);
    return (
      <View
        style={styles.wrap}
        accessibilityRole="summary"
        accessibilityLabel={copy}
      >
        <View
          style={[
            styles.placeholder,
            {
              borderColor: palette.border,
              backgroundColor: palette.panel,
            },
          ]}
        />
        <Text
          style={[styles.caption, { color: palette.textSecondary }]}
          numberOfLines={2}
        >
          {copy}
        </Text>
      </View>
    );
  }

  const a11y = alignmentAccessibilityLabel(t, alignment);

  return (
    <View
      style={styles.wrap}
      accessibilityRole="summary"
      accessibilityLabel={a11y}
    >
      <AlignmentScoreRing score={alignment.score} variant="compact" />
      <Text
        style={[styles.caption, { color: palette.textMuted }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {alignmentTitleLabel(t)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    maxWidth: 108,
    gap: 2,
  },
  placeholder: {
    width: ALIGNMENT_RING_COMPACT_SIZE,
    height: ALIGNMENT_RING_COMPACT_SIZE,
    borderRadius: ALIGNMENT_RING_COMPACT_SIZE / 2,
    borderWidth: 3,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
});
