import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/radius';
import { fontSize, fontWeight } from '../theme/typography';

interface InterestChipProps {
  name: string;
  /** @deprecated Prefer icon + iconColor (Ionicons). */
  emoji?: string;
  icon?: string;
  iconColor?: string;
  selected?: boolean;
  onPress?: () => void;
}

/** Onboarding interest pill — colored icon + label. */
export function InterestChip({
  name,
  emoji,
  icon,
  iconColor,
  selected = false,
  onPress,
}: InterestChipProps) {
  const { palette } = useAppTheme();
  const labelColor = selected ? '#FFFFFF' : palette.textPrimary;
  const resolvedIconColor = selected
    ? '#FFFFFF'
    : iconColor || palette.primary;

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
      {icon ? (
        <Ionicons name={icon as any} size={16} color={resolvedIconColor} />
      ) : emoji ? (
        <Text style={styles.emoji}>{emoji}</Text>
      ) : null}
      <Text
        style={[
          styles.label,
          {
            color: labelColor,
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
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  emoji: { fontSize: 14 },
  label: { fontSize: fontSize.sm },
});
