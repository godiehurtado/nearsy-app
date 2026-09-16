import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';

export type ProfileModeValue = 'personal' | 'professional';

type Props = {
  mode: ProfileModeValue;
  onToggle: () => void;
  personalLabel: string;
  professionalLabel: string;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
};

export default function ModeSwitch({
  mode,
  onToggle,
  personalLabel,
  professionalLabel,
  disabled = false,
  loading = false,
  accessibilityHint,
}: Props) {
  const { palette } = useAppTheme();
  const busy = disabled || loading;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityHint}
      style={[
        styles.track,
        {
          backgroundColor: palette.panel,
          borderColor: palette.border,
        },
      ]}
    >
      {(['personal', 'professional'] as const).map((option) => {
        const selected = mode === option;
        const label =
          option === 'personal' ? personalLabel : professionalLabel;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: busy }}
            accessibilityLabel={label}
            disabled={busy}
            onPress={() => {
              if (selected || busy) return;
              onToggle();
            }}
            style={({ pressed }) => [
              styles.segment,
              selected && {
                backgroundColor: palette.primary,
                ...styles.segmentSelected,
              },
              pressed && !busy && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: selected ? palette.surface : palette.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: spacing.xxs,
    position: 'relative',
    minHeight: 44,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  segmentSelected: {
    shadowColor: '#0A1330',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  pressed: {
    opacity: 0.88,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
});
