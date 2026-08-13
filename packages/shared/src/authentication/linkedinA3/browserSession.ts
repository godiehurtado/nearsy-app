/**
 * Auth-session browser adapter for LinkedIn A3 (expo-web-browser).
 * Never logs authorizationUrl or return URLs.
 */

import { LINKEDIN_APP_RETURN_URL } from './environment/nearsyFirebaseEnvironment';

export type LinkedInAuthBrowserOutcome =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'unavailable' }
  | { type: 'failed' };

export type LinkedInAuthBrowser = {
  openAuthSession: (
    authorizationUrl: string,
    returnUrl: typeof LINKEDIN_APP_RETURN_URL,
  ) => Promise<LinkedInAuthBrowserOutcome>;
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
}): LinkedInAuthBrowserOutcome {
  if (result.type === 'success' && typeof result.url === 'string') {
    return { type: 'success', url: result.url };
  }
  if (result.type === 'cancel') return { type: 'cancel' };
  if (result.type === 'dismiss') return { type: 'dismiss' };
  if (result.type === 'locked') return { type: 'unavailable' };
  return { type: 'failed' };
}

export function createExpoLinkedInAuthBrowser(
  webBrowser: ExpoWebBrowserLike,
): LinkedInAuthBrowser {
  return {
    async openAuthSession(authorizationUrl, returnUrl) {
      if (
        typeof authorizationUrl !== 'string' ||
        !authorizationUrl.startsWith('https://')
      ) {
        return { type: 'failed' };
      }
      if (returnUrl !== LINKEDIN_APP_RETURN_URL) {
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
