/**
 * Auth-session browser adapter for TikTok ownership.
 * Never logs authorizationUrl or return URLs.
 */

import { TIKTOK_OWNERSHIP_RETURN_URL } from './names';

export type TiktokOwnershipBrowserOutcome =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'unavailable' }
  | { type: 'failed' };

export type TiktokOwnershipAuthBrowser = {
  openAuthSession: (
    authorizationUrl: string,
    returnUrl: typeof TIKTOK_OWNERSHIP_RETURN_URL,
  ) => Promise<TiktokOwnershipBrowserOutcome>;
};

export type ExpoWebBrowserLike = {
  openAuthSessionAsync: (
    url: string,
    redirectUrl?: string,
  ) => Promise<{ type: string; url?: string }>;
};

export function mapExpoAuthSessionResult(result: {
  type: string;
  url?: string;
}): TiktokOwnershipBrowserOutcome {
  if (result.type === 'success' && typeof result.url === 'string') {
    return { type: 'success', url: result.url };
  }
  if (result.type === 'cancel') return { type: 'cancel' };
  if (result.type === 'dismiss') return { type: 'dismiss' };
  if (result.type === 'locked') return { type: 'unavailable' };
  return { type: 'failed' };
}

export function createExpoTiktokOwnershipBrowser(
  webBrowser: ExpoWebBrowserLike,
): TiktokOwnershipAuthBrowser {
  return {
    async openAuthSession(authorizationUrl, returnUrl) {
      if (
        typeof authorizationUrl !== 'string' ||
        !authorizationUrl.startsWith('https://')
      ) {
        return { type: 'failed' };
      }
      if (returnUrl !== TIKTOK_OWNERSHIP_RETURN_URL) {
        return { type: 'failed' };
      }
      try {
        const result = await webBrowser.openAuthSessionAsync(
          authorizationUrl,
          returnUrl,
        );
        return mapExpoAuthSessionResult(result);
      } catch {
        return { type: 'unavailable' };
      }
    },
  };
}
