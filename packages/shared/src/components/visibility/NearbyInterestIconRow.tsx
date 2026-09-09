/**
 * Nearby card interest row — icons only (CRJ colors), layout-driven +N overflow.
 * Labels are accessibility-only; never show raw interest IDs.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fontSize, fontWeight, radius, spacing, useAppTheme } from '../../theme';
import {
  planNearbyInterestIconLayout,
  type ResolvedInterestChip,
} from '../../visibility/interestDisplay';

const ICON_SIZE = 28;
const GAP = 6;
const PLUS_WIDTH = 28;

type Props = {
  chips: readonly ResolvedInterestChip[];
};

export function NearbyInterestIconRow({ chips }: Props) {
  const { palette } = useAppTheme();
  const [rowWidth, setRowWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setRowWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);

  const layout = useMemo(
    () =>
      planNearbyInterestIconLayout(chips.length, rowWidth, {
        iconSize: ICON_SIZE,
        gap: GAP,
        plusWidth: PLUS_WIDTH,
      }),
    [chips.length, rowWidth],
  );

  if (chips.length === 0) return null;

  const visible = chips.slice(0, layout.visibleCount);

  return (
    <View style={styles.row} onLayout={onLayout}>
      {visible.map((chip) => (
        <View
          key={chip.id}
          style={[
            styles.iconBtn,
            {
              backgroundColor: palette.chipBg,
              borderColor: palette.border,
            },
          ]}
          accessibilityRole="image"
          accessibilityLabel={chip.label}
        >
          <Ionicons
            name={chip.icon as any}
            size={14}
            color={chip.iconColor || palette.primary}
          />
        </View>
      ))}
      {layout.overflowCount > 0 ? (
        <View
          style={[
            styles.plusBtn,
            {
              backgroundColor: palette.chipBg,
              borderColor: palette.border,
            },
          ]}
          accessibilityRole="text"
          accessibilityLabel={`+${layout.overflowCount}`}
        >
          <Text
            style={[styles.plusText, { color: palette.chipText }]}
            importantForAccessibility="no"
          >
            {`+${layout.overflowCount}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: GAP,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  iconBtn: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: radius.circle,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBtn: {
    minWidth: PLUS_WIDTH,
    height: ICON_SIZE,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
});
