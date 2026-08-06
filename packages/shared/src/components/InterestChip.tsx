import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/radius';
import { fontSize, fontWeight } from '../theme/typography';

interface InterestChipProps {
  name: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
}

/** Onboarding interest pill (nearsy-rn-v3 InterestChip — emoji + label in one pill). */
export function InterestChip({
  name,
  emoji,
  selected = false,
  onPress,
}: InterestChipProps) {
  const { palette } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? palette.primary : palette.chipBg,
          borderColor: selected ? palette.primary : palette.border,
        },
      ]}
    >
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text
        style={[
          styles.label,
          {
            color: selected ? '#FFFFFF' : palette.textPrimary,
            fontWeight: selected ? fontWeight.bold : fontWeight.semibold,
          },
        ]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  emoji: { fontSize: 14 },
  label: { fontSize: fontSize.sm },
});
