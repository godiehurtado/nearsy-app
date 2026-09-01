import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontSize, fontWeight, radius, spacing } from '../../theme';
import { useAppTheme } from '../../theme/ThemeContext';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
};

export function SettingsToggleRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  isLast = false,
}: Props) {
  const { palette } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.iconChip,
          { backgroundColor: palette.chipBg, borderColor: palette.border },
        ]}
      >
        <Ionicons name={icon} size={18} color={palette.chipText} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          {title}
        </Text>
        {description ? (
          <Text style={[styles.description, { color: palette.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityState={{ checked: value, disabled }}
        trackColor={{ false: palette.borderStrong, true: palette.primaryLight }}
        thumbColor={palette.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  description: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.sm * 1.4,
  },
});
