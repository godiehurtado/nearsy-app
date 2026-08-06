import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/radius';
import { fontSize, fontWeight } from '../theme/typography';
import { pressScale } from '../theme/motion';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /**
   * Disabled styling per the approved spec: no fill, 1.5px dashed border, muted label.
   * A blocked primary action must always be accompanied by a visible reason in text.
   */
  disabledReason?: string;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  disabledReason,
  style,
}: ButtonProps) {
  const { palette } = useAppTheme();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDisabled = !!disabled || !!loading;

  if (isPrimary && isDisabled) {
    return (
      <View style={style}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[
            styles.base,
            styles.disabled,
            { borderColor: palette.textMuted },
          ]}
        >
          <Text style={[styles.label, { color: palette.textMuted }]}>
            {label}
          </Text>
        </View>
        {disabledReason ? (
          <Text style={[styles.reason, { color: palette.textMuted }]}>
            {disabledReason}
          </Text>
        ) : null}
      </View>
    );
  }

  if (isPrimary) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          style,
          pressed ? { transform: [{ scale: pressScale }] } : null,
        ]}
      >
        <LinearGradient
          colors={[...palette.primaryGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.base}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.label, { color: '#FFFFFF' }]}>{label}</Text>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor:
            pressed && isSecondary ? palette.socialPressed : 'transparent',
          borderColor: isSecondary ? palette.socialBorder : 'transparent',
          borderWidth: isSecondary ? 1 : 0,
          opacity: isDisabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: palette.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton(
  props: Omit<ButtonProps, 'variant'>,
) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(
  props: Omit<ButtonProps, 'variant'>,
) {
  return <Button {...props} variant="secondary" />;
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  disabled: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.15,
  },
  reason: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginTop: 11,
  },
});
