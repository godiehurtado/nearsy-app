import { normalizeSocialLinkUrl, type SocialLinkPlatform } from './socialLinkUrl.ts';

/**
 * Opens profile social links through the system handler (verified app or browser).
 *
 * `canOpenURL` is intentionally not consulted: on Android 11+ package visibility can
 * make it return false for https links handled by a verified app even though
 * `openURL` succeeds. Never logs the URL.
 */

export type SocialLinkOpener = {
  openURL: (url: string) => Promise<unknown>;
};

export type SocialLinkOpenResult = 'opened' | 'invalid' | 'failed';

export type SocialLinkOpenAlertKey =
  | 'discoveryProfile.openLinkInvalid'
  | 'discoveryProfile.openLinkError';

export async function openSocialLink(
  platform: SocialLinkPlatform,
  rawUrl: unknown,
  opener: SocialLinkOpener,
): Promise<SocialLinkOpenResult> {
  const url = normalizeSocialLinkUrl(platform, rawUrl);
  if (!url) return 'invalid';
  try {
    await opener.openURL(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}

export function socialLinkOpenAlertKey(
  result: SocialLinkOpenResult,
): SocialLinkOpenAlertKey | null {
  if (result === 'invalid') return 'discoveryProfile.openLinkInvalid';
  if (result === 'failed') return 'discoveryProfile.openLinkError';
  return null;
}
