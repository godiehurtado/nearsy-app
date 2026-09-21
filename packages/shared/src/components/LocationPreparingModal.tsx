/**
 * Blocking preparation overlay after FG grant, before background education.
 * ENH-LOC-01 — no dismiss while work is in progress.
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';

type Props = {
  visible: boolean;
};

export function LocationPreparingModal({ visible }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // No user dismiss while preparation is in progress.
      onRequestClose={() => {}}
    >
      <View
        style={[
          styles.backdrop,
          { backgroundColor: 'rgba(12, 25, 54, 0.55)' },
        ]}
        accessibilityViewIsModal
        accessibilityLabel={t(
          'settings.backgroundVisibility.preparing.title' as any,
        )}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              marginBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
        >
          <ActivityIndicator size="large" color={palette.primary} />
          <Text
            style={[styles.title, { color: palette.textPrimary }]}
            accessibilityRole="header"
          >
            {t('settings.backgroundVisibility.preparing.title' as any)}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            {t('settings.backgroundVisibility.preparing.body' as any)}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: screenPadding.horizontal,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    textAlign: 'center',
    lineHeight: fontSize.xl * 1.25,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    textAlign: 'center',
  },
});
