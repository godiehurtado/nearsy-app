/**
 * Prominent disclosure before Android background location request / Settings.
 * Full (first time) vs brief (retries). EN/ES via i18n. Light/Dark via theme.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../theme';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import type { BackgroundDisclosureVariant } from '../location/backgroundEducationStorage';

export type BackgroundLocationDisclosureModalProps = {
  visible: boolean;
  variant: BackgroundDisclosureVariant;
  busy?: boolean;
  onEnable: () => void;
  onNotNow: () => void;
};

export function BackgroundLocationDisclosureModal({
  visible,
  variant,
  busy = false,
  onEnable,
  onNotNow,
}: BackgroundLocationDisclosureModalProps) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isFull = variant === 'full';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) onNotNow();
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.background,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.title, { color: palette.textPrimary }]}>
              {t(
                isFull
                  ? 'settings.backgroundVisibility.disclosure.fullTitle'
                  : 'settings.backgroundVisibility.disclosure.briefTitle',
              )}
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              {t(
                isFull
                  ? 'settings.backgroundVisibility.disclosure.fullBody'
                  : 'settings.backgroundVisibility.disclosure.briefBody',
              )}
            </Text>
            {isFull ? (
              <View style={styles.bullets}>
                <Text style={[styles.bullet, { color: palette.textSecondary }]}>
                  • {t('settings.backgroundVisibility.disclosure.bulletVisibility')}
                </Text>
                <Text style={[styles.bullet, { color: palette.textSecondary }]}>
                  • {t('settings.backgroundVisibility.disclosure.bulletNearby')}
                </Text>
                <Text style={[styles.bullet, { color: palette.textSecondary }]}>
                  • {t('settings.backgroundVisibility.disclosure.bulletControl')}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.footnote, { color: palette.textMuted }]}>
              {t('settings.backgroundVisibility.disclosure.optionalNote')}
            </Text>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onEnable}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: palette.primary,
                opacity: busy ? 0.6 : pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={[styles.primaryText, { color: '#FFFFFF' }]}>
              {t('settings.backgroundVisibility.disclosure.enable')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onNotNow}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { opacity: busy ? 0.6 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.secondaryText, { color: palette.textSecondary }]}>
              {t('settings.backgroundVisibility.disclosure.notNow')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg ?? 16,
    borderTopRightRadius: radius.lg ?? 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '88%',
  },
  content: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  bullets: {
    marginTop: spacing.sm,
    gap: 6,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 20,
  },
  footnote: {
    marginTop: spacing.md,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: radius.md ?? 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
