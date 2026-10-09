import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontSize, fontWeight, radius, spacing } from '../../theme';
import { useAppTheme } from '../../theme/ThemeContext';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  value?: string;
  /** Supporting text under the value; wraps without a line cap. */
  note?: string;
  onPress?: () => void;
  showChevron?: boolean;
  accessibilityHint?: string;
  isLast?: boolean;
};

export function SettingsRow({
  icon,
  title,
  value,
  note,
  onPress,
  showChevron = !!onPress,
  accessibilityHint,
  isLast = false,
}: Props) {
  const { palette } = useAppTheme();
  const interactive = typeof onPress === 'function';
  const accessibilityLabel = [title, value, note].filter(Boolean).join(', ');

  const content = (
    <>
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
        {value ? (
          <Text
            style={[styles.value, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            {value}
          </Text>
        ) : null}
        {note ? (
          <Text style={[styles.note, { color: palette.textMuted }]}>
            {note}
          </Text>
        ) : null}
      </View>
      {showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={palette.textMuted}
        />
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          !isLast && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: palette.border,
          },
          { opacity: pressed ? 0.88 : 1 },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: palette.border,
        },
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
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
  value: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  note: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * 1.5,
  },
});
