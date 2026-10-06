import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';

import { useTranslation } from '../../i18n';
import {
  openSocialLink,
  socialLinkOpenAlertKey,
} from '../../social/socialLinkOpen.ts';
import type { SocialLinkPlatform } from '../../social/socialLinkUrl.ts';

/** Shared open handler for every screen that shows another user's social links. */
export function useOpenSocialLink(): (
  platform: SocialLinkPlatform,
  url: string,
) => Promise<void> {
  const { t } = useTranslation();
  return useCallback(
    async (platform: SocialLinkPlatform, url: string) => {
      const result = await openSocialLink(platform, url, Linking);
      const alertKey = socialLinkOpenAlertKey(result);
      if (alertKey) Alert.alert(t(alertKey));
    },
    [t],
  );
}
