import { InstagramOwnershipClientError } from './errors';
import { assertInstagramInboxAuthorizeStartResponse } from './parse';

export type OpenInstagramInboxAuthorizationDeps = {
  canOpenURL: (url: string) => Promise<boolean>;
  openURL: (url: string) => Promise<unknown>;
};

/**
 * Open a validated Instagram OAuth authorize URL in the system browser.
 * Does not log the URL, query, codes, or tokens.
 */
export async function openInstagramInboxAuthorizationUrl(
  authorizationUrl: string,
  deps: OpenInstagramInboxAuthorizationDeps,
): Promise<void> {
  const { authorizationUrl: url } = assertInstagramInboxAuthorizeStartResponse({
    authorizationUrl,
  });
  const canOpen = await deps.canOpenURL(url);
  if (!canOpen) {
    throw new InstagramOwnershipClientError(
      'NETWORK',
      'Could not open inbox authorization.',
      { retryable: true, stage: 'inboxAuthorize' },
    );
  }
  await deps.openURL(url);
}
