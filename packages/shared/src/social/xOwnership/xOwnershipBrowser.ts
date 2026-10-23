/**
 * System-browser auth session for X ownership.
 * Never logs authorizationUrl or return URLs.
 */

import { X_OWNERSHIP_RETURN_URL } from './xOwnershipContract.ts';

export type XOwnershipBrowserOutcome =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'unavailable' }
  | { type: 'failed' };

export type XOwnershipBrowser = {
  openAuthSession: (
    authorizationUrl: string,
    returnUrl: typeof X_OWNERSHIP_RETURN_URL,
  ) => Promise<XOwnershipBrowserOutcome>;
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
}): XOwnershipBrowserOutcome {
  if (result.type === 'success' && typeof result.url === 'string') {
    return { type: 'success', url: result.url };
  }
  if (result.type === 'cancel') return { type: 'cancel' };
  if (result.type === 'dismiss') return { type: 'dismiss' };
  if (result.type === 'locked') return { type: 'unavailable' };
  return { type: 'failed' };
}

export function createExpoXOwnershipBrowser(
  webBrowser: ExpoWebBrowserLike,
): XOwnershipBrowser {
  return {
    async openAuthSession(authorizationUrl, returnUrl) {
      if (
        typeof authorizationUrl !== 'string' ||
        !authorizationUrl.startsWith('https://')
      ) {
        return { type: 'failed' };
      }
      if (returnUrl !== X_OWNERSHIP_RETURN_URL) {
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
