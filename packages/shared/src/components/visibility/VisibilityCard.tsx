import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { cardShadow } from '../../theme/shadows';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function VisibilityCard({ children, style }: Props) {
  const { palette } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        cardShadow,
        {
          backgroundColor: palette.panel,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg + 4,
    padding: spacing.lg + 2,
  },
});
