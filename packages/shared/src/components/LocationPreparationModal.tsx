/**
 * Transient preparation UI between FG grant and background disclosure.
 * Shown only while real async work runs — no artificial delays.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../theme';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';

export type LocationPreparationModalProps = {
  visible: boolean;
};

export function LocationPreparationModal({
  visible,
}: LocationPreparationModalProps) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      // No user dismiss while a real operation is in progress.
      onRequestClose={() => {}}
    >
      <View
        style={styles.backdrop}
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.background,
              borderColor: palette.border,
              marginBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
          accessibilityRole="progressbar"
          accessibilityLabel={t(
            'settings.backgroundVisibility.preparation.title',
          )}
        >
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {t('settings.backgroundVisibility.preparation.title')}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            {t('settings.backgroundVisibility.preparation.body')}
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
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg ?? 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    marginTop: spacing.md,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
