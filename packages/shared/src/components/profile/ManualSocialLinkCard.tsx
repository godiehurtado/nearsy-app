/**
 * Facebook / LinkedIn / Website card for the CRJ and the editor. Looks like the
 * ownership cards, but its status is only "Link saved": no green dot and no badge,
 * because nothing here verifies the account.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n';
import {
  manualSocialLinkCardState,
  type ManualSocialLinkId,
} from '../../social/manualSocialLinkCard';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import {
  SOCIAL_ACTION_HIT_SLOP,
  socialActionButtonStyles,
} from './socialActionButtonStyles';

type Props = {
  id: ManualSocialLinkId;
  label: string;
  url: string;
  glyph: React.ReactNode;
  /** Locks the actions while any manual link is being written. */
  disabled?: boolean;
  /** A removal for this card is being written. */
  removing?: boolean;
  error?: string | null;
  onOpen: () => void;
  onRemove: () => void;
};

export function ManualSocialLinkCard({
  id,
  label,
  url,
  glyph,
  disabled = false,
  removing = false,
  error,
  onOpen,
  onRemove,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const state = manualSocialLinkCardState(url);

  return (
    <View
      testID={`manual-social-card-${id}`}
      style={[
        styles.card,
        { backgroundColor: palette.panel, borderColor: palette.border },
      ]}
    >
      <View style={styles.topRow}>
        {glyph}
        <View style={styles.textCol}>
          <Text style={[styles.name, { color: palette.textPrimary }]}>{label}</Text>
          <Text style={[styles.status, { color: palette.textMuted }]}>
            {t(state.statusKey)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(state.primaryA11yKey, { platform: label })}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={SOCIAL_ACTION_HIT_SLOP}
          onPress={onOpen}
          style={({ pressed }) => [
            socialActionButtonStyles.button,
            { backgroundColor: palette.primary, borderColor: palette.primary },
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Text style={[socialActionButtonStyles.text, { color: '#FFFFFF' }]}>
            {t(state.primaryLabelKey)}
          </Text>
        </Pressable>
      </View>

      {state.saved ? (
        <View style={styles.savedRow}>
          <Text
            style={[styles.url, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            {url}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.social.removeLinkA11y', {
              platform: label,
            })}
            accessibilityState={{ disabled, busy: removing }}
            disabled={disabled}
            hitSlop={SOCIAL_ACTION_HIT_SLOP}
            onPress={onRemove}
            style={({ pressed }) => [
              socialActionButtonStyles.button,
              { backgroundColor: 'transparent', borderColor: palette.danger },
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Text style={[socialActionButtonStyles.text, { color: palette.danger }]}>
              {removing ? t('profile.social.saving') : t('profile.social.removeLink')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: palette.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textCol: { flex: 1, minWidth: 0 },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  status: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  url: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
  },
  error: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.55 },
});
