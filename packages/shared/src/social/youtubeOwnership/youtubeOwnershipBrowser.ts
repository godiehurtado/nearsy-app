/**
 * System-browser auth session for YouTube ownership.
 * Never logs authorizationUrl or return URLs.
 */

import { YOUTUBE_OWNERSHIP_RETURN_URL } from './youtubeOwnershipContract.ts';

export type YoutubeOwnershipBrowserOutcome =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'unavailable' }
  | { type: 'failed' };

export type YoutubeOwnershipBrowser = {
  openAuthSession: (
    authorizationUrl: string,
    returnUrl: typeof YOUTUBE_OWNERSHIP_RETURN_URL,
  ) => Promise<YoutubeOwnershipBrowserOutcome>;
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
}): YoutubeOwnershipBrowserOutcome {
  if (result.type === 'success' && typeof result.url === 'string') {
    return { type: 'success', url: result.url };
  }
  if (result.type === 'cancel') return { type: 'cancel' };
  if (result.type === 'dismiss') return { type: 'dismiss' };
  if (result.type === 'locked') return { type: 'unavailable' };
  return { type: 'failed' };
}

export function createExpoYoutubeOwnershipBrowser(
  webBrowser: ExpoWebBrowserLike,
): YoutubeOwnershipBrowser {
  return {
    async openAuthSession(authorizationUrl, returnUrl) {
      if (
        typeof authorizationUrl !== 'string' ||
        !authorizationUrl.startsWith('https://')
      ) {
        return { type: 'failed' };
      }
      if (returnUrl !== YOUTUBE_OWNERSHIP_RETURN_URL) {
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
