/**
 * Background location education sheet (ENH-LOC-01).
 * Uses existing theme tokens — Light/Dark via useAppTheme.
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import { PrimaryButton, SecondaryButton } from './PrimaryButton';
import { useTranslation } from '../i18n';
import type { BackgroundEducationVariant } from '../visibility/locationEducation';

type Props = {
  visible: boolean;
  variant: BackgroundEducationVariant;
  busy?: boolean;
  onEnableBackground: () => void;
  onNotNow: () => void;
};

export function BackgroundLocationEducationModal({
  visible,
  variant,
  busy = false,
  onEnableBackground,
  onNotNow,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const prefix =
    variant === 'brief'
      ? 'settings.backgroundVisibility.education.brief'
      : 'settings.backgroundVisibility.education.full';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onNotNow();
      }}
    >
      <View
        style={[
          styles.backdrop,
          { backgroundColor: 'rgba(12, 25, 54, 0.55)' },
        ]}
        accessibilityViewIsModal
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => !busy && onNotNow()}
          accessibilityRole="button"
          accessibilityLabel={t(
            'settings.backgroundVisibility.education.notNow' as any,
          )}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
          accessibilityRole="summary"
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[styles.title, { color: palette.textPrimary }]}
              accessibilityRole="header"
            >
              {t(`${prefix}.title` as any)}
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              {t(`${prefix}.body` as any)}
            </Text>
            <Text style={[styles.control, { color: palette.textMuted }]}>
              {t('settings.backgroundVisibility.education.controlNote' as any)}
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <PrimaryButton
              label={t(
                'settings.backgroundVisibility.education.enableBackground' as any,
              )}
              onPress={onEnableBackground}
              loading={busy}
              disabled={busy}
            />
            <SecondaryButton
              label={t(
                'settings.backgroundVisibility.education.notNow' as any,
              )}
              onPress={onNotNow}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: screenPadding.horizontal,
    paddingTop: spacing.xl,
    maxHeight: '78%',
  },
  content: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    lineHeight: fontSize.xl * 1.25,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
  },
  control: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.45,
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
