import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { cardShadow } from '../../theme/shadows';

type Props = {
  visible: boolean;
  saveLabel: string;
  cancelLabel: string;
  saving: boolean;
  saveDisabled: boolean;
  cancelDisabled?: boolean;
  bottomInset: number;
  onSave: () => void;
  onCancel: () => void;
};

export default function OwnProfileSaveBar({
  visible,
  saveLabel,
  cancelLabel,
  saving,
  saveDisabled,
  cancelDisabled = false,
  bottomInset,
  onSave,
  onCancel,
}: Props) {
  const { palette } = useAppTheme();

  if (!visible) return null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          paddingBottom: bottomInset > 0 ? bottomInset + spacing.sm : spacing.lg,
        },
        cardShadow,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          accessibilityState={{ disabled: cancelDisabled || saving }}
          disabled={cancelDisabled || saving}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.cancelBtn,
            {
              borderColor: palette.borderStrong,
              backgroundColor: palette.panel,
            },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.cancelText, { color: palette.textPrimary }]}>
            {cancelLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          accessibilityState={{ disabled: saveDisabled, busy: saving }}
          disabled={saveDisabled}
          onPress={onSave}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: palette.primary,
            },
            saveDisabled && styles.disabled,
            pressed && !saveDisabled && styles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={palette.surface} />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color={palette.surface} />
              <Text style={[styles.saveText, { color: palette.surface }]}>
                {saveLabel}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: screenPadding.horizontal,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  saveBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  saveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
});
