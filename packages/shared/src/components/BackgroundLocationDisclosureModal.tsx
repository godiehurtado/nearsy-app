/**
 * Prominent disclosure before Android background location request / Settings.
 * Full (first time) vs brief (retries). Unmounts when not visible (no ghost overlay).
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
  /** When true, show API 30+ Settings guidance under the body. */
  settingsPath?: boolean;
  primaryLabelKey?: string;
  onEnable: () => void;
  onNotNow: () => void;
};

export function BackgroundLocationDisclosureModal({
  visible,
  variant,
  busy = false,
  settingsPath = false,
  primaryLabelKey,
  onEnable,
  onNotNow,
}: BackgroundLocationDisclosureModalProps) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isFull = variant === 'full';

  // Fully unmount when hidden — prevents invisible backdrop/modal races.
  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!busy) onNotNow();
      }}
    >
      <View
        style={styles.backdrop}
        accessibilityViewIsModal
      >
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
                  ? 'settings.backgroundVisibility.education.full.title'
                  : 'settings.backgroundVisibility.education.brief.title',
              )}
            </Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              {t(
                isFull
                  ? 'settings.backgroundVisibility.education.full.body'
                  : 'settings.backgroundVisibility.education.brief.body',
              )}
            </Text>
            {settingsPath ? (
              <Text style={[styles.body, { color: palette.textSecondary }]}>
                {t('settings.backgroundVisibility.education.settingsHint')}
              </Text>
            ) : null}
            {isFull ? (
              <Text style={[styles.footnote, { color: palette.textMuted }]}>
                {t('settings.backgroundVisibility.education.controlNote')}
              </Text>
            ) : null}
            <Text style={[styles.footnote, { color: palette.textMuted }]}>
              {t('settings.backgroundVisibility.education.optionalNote')}
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
              {t(
                primaryLabelKey ??
                  (settingsPath
                    ? 'settings.backgroundVisibility.openSettings'
                    : 'settings.backgroundVisibility.education.enableBackground'),
              )}
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
            <Text
              style={[styles.secondaryText, { color: palette.textSecondary }]}
            >
              {t('settings.backgroundVisibility.education.notNow')}
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
