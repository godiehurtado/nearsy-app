/**
 * Facebook / LinkedIn / Website card for the CRJ and the editor. Looks like the
 * ownership cards, but its status is only "Link saved": no green dot and no badge,
 * because nothing here verifies the account.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
          accessibilityLabel={t(state.actionA11yKey, { platform: label })}
          accessibilityState={{ disabled, busy: removing }}
          disabled={disabled}
          hitSlop={SOCIAL_ACTION_HIT_SLOP}
          onPress={state.saved ? onRemove : onOpen}
          style={({ pressed }) => [
            socialActionButtonStyles.button,
            state.saved
              ? { backgroundColor: 'transparent', borderColor: palette.danger }
              : { backgroundColor: palette.primary, borderColor: palette.primary },
            disabled && styles.disabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          {removing ? (
            <ActivityIndicator color={palette.danger} />
          ) : (
            <Text
              style={[
                socialActionButtonStyles.text,
                { color: state.saved ? palette.danger : '#FFFFFF' },
              ]}
            >
              {t(state.actionLabelKey)}
            </Text>
          )}
        </Pressable>
      </View>

      {state.showEdit ? (
        <View style={styles.savedRow}>
          <Text
            style={[styles.url, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            {url}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.social.editLinkA11y', {
              platform: label,
            })}
            accessibilityState={{ disabled }}
            disabled={disabled}
            hitSlop={SOCIAL_ACTION_HIT_SLOP}
            onPress={onOpen}
            style={({ pressed }) => [
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Text style={[styles.edit, { color: palette.textPrimary }]}>
              {t('profile.social.editLink')}
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
  edit: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.55 },
});
