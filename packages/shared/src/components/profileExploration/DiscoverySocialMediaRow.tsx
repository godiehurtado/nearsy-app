/**
 * Social Media icon row for Profile Exploration.
 * Renders only when getDiscoveryProfile.socialLinks has ≥1 valid entry.
 * Never invents placeholders for missing networks.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import { useTranslation } from '../../i18n';
import { radius, spacing, useAppTheme } from '../../theme';
import { cardShadow } from '../../theme/shadows';
import {
  DISCOVERY_SOCIAL_PLATFORM_VISUAL,
  discoverySocialPlatformI18nKey,
  type DiscoveryPublicSocialLink,
  type DiscoverySocialPlatform,
} from '../../visibility/discoverySocialLinks';
import { useOpenSocialLink } from './useOpenSocialLink';

type Props = {
  links?: readonly DiscoveryPublicSocialLink[] | null;
};

function PlatformIcon({
  platform,
}: {
  platform: DiscoverySocialPlatform;
}) {
  const visual = DISCOVERY_SOCIAL_PLATFORM_VISUAL[platform];
  const isLightMark = platform === 'snapchat';
  const color = isLightMark ? '#111111' : visual.color;

  if (visual.iconSet === 'fontawesome6') {
    return (
      <FontAwesome6
        name={visual.ionicon as React.ComponentProps<typeof FontAwesome6>['name']}
        size={20}
        color={color}
      />
    );
  }

  return (
    <Ionicons
      name={visual.ionicon as React.ComponentProps<typeof Ionicons>['name']}
      size={22}
      color={isLightMark ? '#111111' : visual.color}
    />
  );
}

export function DiscoverySocialMediaRow({ links }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const items = Array.isArray(links)
    ? links.filter((l) => l?.platform && l?.url)
    : [];
  const openLink = useOpenSocialLink();

  if (items.length === 0) return null;

  return (
    <View
      style={styles.row}
      accessibilityRole="summary"
      accessibilityLabel={t('discoveryProfile.a11ySocialMedia')}
    >
      {items.map((link) => {
        const label = t(
          `discoveryProfile.${discoverySocialPlatformI18nKey(link.platform)}`,
        );
        return (
          <Pressable
            key={`${link.platform}:${link.url}`}
            onPress={() => void openLink(link.platform, link.url)}
            accessibilityRole="link"
            accessibilityLabel={label}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                opacity: pressed ? 0.72 : 1,
              },
              cardShadow,
            ]}
          >
            <PlatformIcon platform={link.platform} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.circle,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
