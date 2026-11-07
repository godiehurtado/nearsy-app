/**
 * Social Media icon row for Profile Exploration.
 * Renders only when getDiscoveryProfile.socialLinks has ≥1 valid entry;
 * invalid entries are hidden individually.
 * Never invents placeholders for missing networks.
 */
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import { trackMatchSocialTapped } from '../../analytics';
import { useTranslation } from '../../i18n';
import { radius, spacing, useAppTheme } from '../../theme';
import { cardShadow } from '../../theme/shadows';
import {
  DISCOVERY_SOCIAL_PLATFORM_VISUAL,
  discoverySocialPlatformI18nKey,
  openDiscoverySocialLink,
  parseDiscoverySocialLinks,
  type DiscoveryPublicSocialLink,
  type DiscoverySocialPlatform,
} from '../../visibility/discoverySocialLinks';

type Props = {
  links?: readonly DiscoveryPublicSocialLink[] | null;
  matchScore?: number;
};

/** The tap is the event; a stalled open still reports it, with no known result. */
const OPEN_RESULT_WAIT_MS = 1500;

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

export function DiscoverySocialMediaRow({ links, matchScore }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const items = useMemo(
    () =>
      parseDiscoverySocialLinks(links).filter(
        (link) => link.platform !== 'snapchat',
      ),
    [links],
  );

  const openLink = useCallback(
    async (link: DiscoveryPublicSocialLink) => {
      let reported = false;
      const report = (
        openResult: 'opened' | 'invalid' | 'failed' | 'unknown',
      ) => {
        if (reported) return;
        reported = true;
        trackMatchSocialTapped({
          platform: link.platform,
          score: matchScore,
          openResult,
        });
      };
      const waitTimer = setTimeout(() => report('unknown'), OPEN_RESULT_WAIT_MS);
      const result = await openDiscoverySocialLink(link, Linking);
      clearTimeout(waitTimer);
      report(result);
      if (result === 'invalid') {
        Alert.alert(t('discoveryProfile.invalidLinkError'));
      } else if (result === 'failed') {
        Alert.alert(t('discoveryProfile.openLinkError'));
      }
    },
    [t, matchScore],
  );

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
            onPress={() => void openLink(link)}
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
