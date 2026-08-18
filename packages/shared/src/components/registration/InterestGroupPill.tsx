import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';

type Props = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const CAPSULE_RADIUS = 100;

/** Level-1 navigation pill — text-only, distinct from selectable interest chips. */
export function InterestGroupPill({ label, active, onPress }: Props) {
  const { palette } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 5, bottom: 5 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.capsule,
        {
          backgroundColor: active ? 'transparent' : palette.panel,
          borderColor: active ? 'transparent' : palette.accentBorder,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      {active ? (
        <LinearGradient
          colors={[...palette.primaryGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          style={styles.gradientFill}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          active ? styles.labelActive : { color: palette.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capsule: {
    borderRadius: CAPSULE_RADIUS,
    minHeight: 34,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CAPSULE_RADIUS,
  },
  label: {
    fontSize: fontSize.sm - 0.5,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: fontWeight.extrabold,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
