import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useTranslation } from '../../i18n';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  primaryLabel: string;
  primaryA11y?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onRequestClose: () => void;
  children?: React.ReactNode;
};

export function SocialConnectionModal({
  visible,
  title,
  body,
  primaryLabel,
  primaryA11y,
  onPrimary,
  primaryDisabled,
  primaryBusy,
  secondaryLabel,
  onSecondary,
  onRequestClose,
  children,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const cancelLabel = secondaryLabel ?? t('common.cancel');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onRequestClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onRequestClose}
          style={styles.backdrop}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Text
              style={[styles.title, { color: palette.textPrimary }]}
              maxFontSizeMultiplier={1.6}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <Text
              style={[styles.body, { color: palette.textSecondary }]}
              maxFontSizeMultiplier={1.6}
            >
              {body}
            </Text>
            {children}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onSecondary ?? onRequestClose}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: palette.border },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.secondaryText, { color: palette.textPrimary }]}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryA11y ?? primaryLabel}
              accessibilityState={{ disabled: !!primaryDisabled, busy: !!primaryBusy }}
              disabled={primaryDisabled || primaryBusy}
              onPress={onPrimary}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: palette.primary },
                (primaryDisabled || primaryBusy) && styles.disabled,
                pressed && !primaryDisabled && styles.pressed,
              ]}
            >
              <Text style={[styles.primaryText, { color: palette.surface }]}>
                {primaryLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  secondaryText: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  primaryText: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
