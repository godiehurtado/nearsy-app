/**
 * Facebook / LinkedIn / Website card shared by the CRJ and the post-CRJ social
 * editor. Same visual as the verified-network cards (large glyph, name, status,
 * rounded blue button) but the status is "Link saved" — never a verification
 * badge. Connect/Edit open the caller's sheet; Disconnect removes it immediately.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import { useTranslation } from '../../i18n';
import {
  getCrjSocialPlatform,
  type CrjSocialPlatformId,
} from '../../social/onboardingSocialCatalog';
import {
  manualSocialLinkCardState,
  type ManualSocialLinkId,
} from '../../social/manualSocialLinkCard';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

const WEBSITE_GLYPH = {
  ionicon: 'globe-outline',
  iconSet: 'ionicons' as const,
  color: '#64748B',
};

function ManualLinkGlyph({ id }: { id: ManualSocialLinkId }) {
  const platform =
    id === 'website'
      ? WEBSITE_GLYPH
      : getCrjSocialPlatform(id as CrjSocialPlatformId);
  return (
    <View
      style={[styles.glyph, { backgroundColor: platform.color }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {platform.iconSet === 'fontawesome6' ? (
        <FontAwesome6
          name={platform.ionicon as React.ComponentProps<typeof FontAwesome6>['name']}
          size={16}
          color="#FFFFFF"
        />
      ) : (
        <Ionicons
          name={platform.ionicon as React.ComponentProps<typeof Ionicons>['name']}
          size={18}
          color="#FFFFFF"
        />
      )}
    </View>
  );
}

type Props = {
  id: ManualSocialLinkId;
  label: string;
  url: string;
  /** Locks the buttons while a save/remove for this card is in flight. */
  busy?: boolean;
  error?: string | null;
  onOpenSheet: () => void;
  onRemove: () => void;
};

export function ManualSocialLinkCard({
  id,
  label,
  url,
  busy = false,
  error,
  onOpenSheet,
  onRemove,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const state = manualSocialLinkCardState(url);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.panel, borderColor: palette.border },
      ]}
      testID={`manual-social-card-${id}`}
    >
      <View style={styles.topRow}>
        <ManualLinkGlyph id={id} />
        <View style={styles.textCol}>
          <Text style={[styles.name, { color: palette.textPrimary }]}>
            {label}
          </Text>
          <Text style={[styles.status, { color: palette.textMuted }]}>
            {t(state.statusKey)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(state.primary.a11yKey, { platform: label })}
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={onOpenSheet}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: palette.primary, borderColor: palette.primary },
            busy && styles.disabled,
            pressed && !busy && styles.pressed,
          ]}
        >
          <Text style={[styles.pillText, { color: palette.surface }]}>
            {t(state.primary.labelKey)}
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
            accessibilityLabel={t('profile.social.disconnectA11y', {
              platform: label,
            })}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onRemove}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: 'transparent', borderColor: palette.danger },
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Text style={[styles.pillText, { color: palette.danger }]}>
              {t('profile.social.disconnect')}
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
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
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
