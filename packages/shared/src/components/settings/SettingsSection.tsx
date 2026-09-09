import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontSize, fontWeight, spacing, screenPadding } from '../../theme';
import { useAppTheme } from '../../theme/ThemeContext';

type Props = {
  title: string;
  children: React.ReactNode;
};

export function SettingsSection({ title, children }: Props) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.textMuted }]}
      >
        {title}
      </Text>
      <View
        style={[
          styles.panel,
          { backgroundColor: palette.panel, borderColor: palette.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    paddingHorizontal: screenPadding.horizontal,
  },
  title: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  panel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
