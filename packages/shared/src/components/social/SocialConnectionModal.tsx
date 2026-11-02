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
  /** Optional platform glyph rendered beside the title. */
  headerIcon?: React.ReactNode;
  /** Numbered instructional steps (Instagram DM verify, etc.). */
  steps?: readonly string[];
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
  headerIcon,
  steps,
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
            <View style={styles.titleRow}>
              {headerIcon ? (
                <View style={styles.iconSlot}>{headerIcon}</View>
              ) : null}
              <Text
                style={[styles.title, { color: palette.textPrimary }]}
                maxFontSizeMultiplier={1.5}
                accessibilityRole="header"
              >
                {title}
              </Text>
            </View>
            <Text
              style={[styles.body, { color: palette.textSecondary }]}
              maxFontSizeMultiplier={1.5}
            >
              {body}
            </Text>
            {steps && steps.length > 0 ? (
              <View style={styles.steps} accessibilityRole="summary">
                {steps.map((step, index) => (
                  <View key={`step-${index}`} style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepBadge,
                        {
                          backgroundColor: palette.chipBg,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.stepBadgeText,
                          { color: palette.textPrimary },
                        ]}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <Text
                      style={[styles.stepText, { color: palette.textPrimary }]}
                      maxFontSizeMultiplier={1.5}
                    >
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconSlot: {
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
    lineHeight: 30,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  steps: {
    gap: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  stepText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: fontWeight.medium,
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
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  primaryText: {
    fontWeight: fontWeight.bold,
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
