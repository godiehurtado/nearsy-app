import { InstagramOwnershipClientError } from './errors';
import { assertInstagramInboxAuthorizeStartResponse } from './parse';

export type InstagramInboxBrowserResult = {
  type: string;
};

export type OpenInstagramInboxAuthorizationDeps = {
  openBrowserAsync: (url: string) => Promise<InstagramInboxBrowserResult>;
};

/**
 * Open the backend authorizationUrl in an explicit in-app browser
 * (expo-web-browser openBrowserAsync → SFSafariViewController on iOS).
 * Callback is HTTPS HTML from Functions, not an app scheme: dismiss/cancel
 * after the page is the expected close. Do not log the URL, query, codes,
 * or tokens. Do not reconstruct query params or invent a return URL.
 */
export async function openInstagramInboxAuthorizationUrl(
  authorizationUrl: string,
  deps: OpenInstagramInboxAuthorizationDeps,
): Promise<void> {
  const { authorizationUrl: url } = assertInstagramInboxAuthorizeStartResponse({
    authorizationUrl,
  });
  let result: InstagramInboxBrowserResult;
  try {
    result = await deps.openBrowserAsync(url);
  } catch {
    throw new InstagramOwnershipClientError(
      'NETWORK',
      'Could not open inbox authorization.',
      { retryable: true, stage: 'inboxAuthorize' },
    );
  }
  if (result.type === 'locked') {
    throw new InstagramOwnershipClientError(
      'NETWORK',
      'Could not open inbox authorization.',
      { retryable: true, stage: 'inboxAuthorize' },
    );
  }
}
