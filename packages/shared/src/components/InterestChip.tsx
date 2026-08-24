import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
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
  /** other = Other placeholder; keeps icon colored even when active. */
  variant?: 'default' | 'other';
  onPress?: () => void;
}

/** Onboarding interest pill — colored icon + label. */
export function InterestChip({
  name,
  emoji,
  icon,
  iconColor,
  selected = false,
  variant = 'default',
  onPress,
}: InterestChipProps) {
  const { palette } = useAppTheme();
  const isOther = variant === 'other';
  const labelColor = isOther
    ? selected
      ? palette.primary
      : palette.textSecondary
    : selected
      ? '#FFFFFF'
      : palette.textPrimary;
  const resolvedIconColor = isOther
    ? iconColor || palette.primary
    : selected
      ? '#FFFFFF'
      : iconColor || palette.primary;

  const content = (
    <>
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
            fontWeight: isOther
              ? fontWeight.bold
              : selected
                ? fontWeight.bold
                : fontWeight.semibold,
          },
        ]}
      >
        {name}
      </Text>
    </>
  );

  const pillStyle = [
    styles.pill,
    isOther
      ? {
          backgroundColor: selected ? palette.chipBg : 'transparent',
          borderColor: selected ? palette.primary : palette.accentBorder,
          borderWidth: selected ? 1.5 : 1,
        }
      : {
          backgroundColor: selected ? palette.primary : palette.chipBg,
          borderColor: selected ? palette.primary : palette.border,
        },
  ];

  // Avoid nested Pressable stealing taps when used as a display-only chip.
  if (!onPress) {
    return (
      <View
        accessibilityRole="text"
        accessibilityState={{ selected }}
        style={pillStyle}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={pillStyle}
    >
      {content}
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
