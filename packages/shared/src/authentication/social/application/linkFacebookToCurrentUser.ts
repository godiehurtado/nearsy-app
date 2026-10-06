import type { SocialAuthenticationProviderAdapter } from './socialAuthenticationPort';
import type { SocialProviderRegistry } from './providerRegistry';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import { SocialAuthError } from '../domain/socialAuthenticationError';
import { selectFacebookCredentialTokens } from '../domain/facebookCredentialPolicy';
import {
  FacebookLinkError,
  FIREBASE_PROVIDER_ALREADY_LINKED_CODE,
  mapFirebaseLinkError,
  readFirebaseErrorCode,
} from '../domain/facebookLinkError';
import type {
  FirebaseAccountLinkingPort,
  LinkedAccountSnapshot,
} from '../infrastructure/firebase/firebaseAccountLinkingPort';

export const FACEBOOK_PROVIDER_ID = 'facebook.com';

export type FacebookLinkOutcome = {
  status: 'linked' | 'already_linked';
  providerIds: readonly string[];
};

export interface LinkFacebookToCurrentUserDependencies {
  registry: SocialProviderRegistry;
  accountLinking: FirebaseAccountLinkingPort;
}

export interface LinkFacebookToCurrentUserRequest {
  /** Explicit user confirmation; resolved `false` cancels silently. */
  confirm: () => Promise<boolean>;
}

function mapProviderError(err: unknown): FacebookLinkError {
  if (err instanceof FacebookLinkError) return err;
  if (!(err instanceof SocialAuthError)) {
    return new FacebookLinkError('UNKNOWN', 'FACEBOOK_PROVIDER_FAILED');
  }
  const diagnostic = err.social.diagnosticCode ?? err.social.code;
  switch (err.social.code) {
    case 'CANCELLED':
      return new FacebookLinkError('CANCELLED', diagnostic);
    case 'IN_PROGRESS':
      return new FacebookLinkError('IN_PROGRESS', diagnostic);
    case 'NETWORK_ERROR':
      return new FacebookLinkError('NETWORK_ERROR', diagnostic);
    case 'TOKEN_MISSING':
      return new FacebookLinkError('TOKEN_MISSING', diagnostic);
    case 'TOKEN_INVALID':
      return new FacebookLinkError('TOKEN_INVALID', diagnostic);
    case 'PROVIDER_UNAVAILABLE':
    case 'CONFIGURATION_ERROR':
      return new FacebookLinkError('PROVIDER_UNAVAILABLE', diagnostic);
    default:
      return new FacebookLinkError('UNKNOWN', diagnostic);
  }
}

function logDev(error: FacebookLinkError): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[linkFacebookToCurrentUser]', {
      code: error.code,
      diagnosticCode: error.diagnosticCode,
    });
  }
}

const hasFacebook = (snapshot: LinkedAccountSnapshot | null) =>
  !!snapshot && snapshot.providerIds.includes(FACEBOOK_PROVIDER_ID);

/**
 * Explicit "Connect Facebook" for the signed-in Nearsy user:
 * current user → captured UID → confirmation → Facebook Limited Login (OIDC +
 * raw nonce) → `linkWithCredential(currentUser)` → UID check → reload.
 *
 * Never signs in, never creates or merges users, never looks up accounts by
 * email and keeps the credential in memory only for this attempt.
 */
export function createLinkFacebookToCurrentUser(
  deps: LinkFacebookToCurrentUserDependencies,
) {
  let inProgress = false;

  return async function linkFacebookToCurrentUser(
    request: LinkFacebookToCurrentUserRequest,
  ): Promise<FacebookLinkOutcome> {
    if (inProgress) {
      throw new FacebookLinkError('IN_PROGRESS', 'LINK_IN_PROGRESS');
    }

    inProgress = true;
    let provider: SocialAuthenticationProviderAdapter | undefined;
    let providerOpened = false;

    try {
      const before = deps.accountLinking.getCurrentAccount();
      if (!before) {
        throw new FacebookLinkError('NOT_AUTHENTICATED', 'NO_CURRENT_USER');
      }
      const initialUid = before.uid;

      if (hasFacebook(before)) {
        return { status: 'already_linked', providerIds: before.providerIds };
      }

      if (!(await request.confirm())) {
        throw new FacebookLinkError('CANCELLED', 'LINK_CONFIRMATION_DECLINED');
      }

      if (!deps.registry.isRegistered('facebook')) {
        throw new FacebookLinkError('PROVIDER_UNAVAILABLE', 'FACEBOOK_NOT_REGISTERED');
      }

      let result: ProviderAuthenticationResult;
      try {
        provider = deps.registry.get('facebook');
        providerOpened = true;
        await provider.configure();
        result = await provider.authenticate({ provider: 'facebook', interactive: true });
      } catch (err) {
        throw mapProviderError(err);
      }

      // Linking requires the Limited Login OIDC pair; no classic AccessToken path.
      const tokens = selectFacebookCredentialTokens(result);
      if (!tokens) {
        throw new FacebookLinkError('TOKEN_MISSING', 'FACEBOOK_TOKEN_MISSING');
      }
      if (tokens.kind !== 'oidc') {
        throw new FacebookLinkError('TOKEN_MISSING', 'FACEBOOK_OIDC_TOKEN_REQUIRED');
      }

      let linked: LinkedAccountSnapshot;
      try {
        linked = await deps.accountLinking.linkFacebookOidcCredential({
          expectedUid: initialUid,
          idToken: tokens.idToken,
          rawNonce: tokens.rawNonce,
        });
      } catch (err) {
        if (readFirebaseErrorCode(err) === FIREBASE_PROVIDER_ALREADY_LINKED_CODE) {
          const refreshed = await deps.accountLinking.reloadCurrentAccount();
          if (refreshed && refreshed.uid === initialUid && hasFacebook(refreshed)) {
            return { status: 'already_linked', providerIds: refreshed.providerIds };
          }
          throw new FacebookLinkError('UNKNOWN', FIREBASE_PROVIDER_ALREADY_LINKED_CODE);
        }
        throw mapFirebaseLinkError(err);
      }

      if (linked.uid !== initialUid) {
        throw new FacebookLinkError('IDENTITY_CHANGED', 'UID_CHANGED_AFTER_LINK');
      }

      const refreshed = await deps.accountLinking.reloadCurrentAccount();
      if (!refreshed || refreshed.uid !== initialUid) {
        throw new FacebookLinkError('IDENTITY_CHANGED', 'UID_CHANGED_AFTER_RELOAD');
      }

      return {
        status: 'linked',
        providerIds: hasFacebook(refreshed) ? refreshed.providerIds : linked.providerIds,
      };
    } catch (err) {
      const error =
        err instanceof FacebookLinkError
          ? err
          : new FacebookLinkError('UNKNOWN', 'UNEXPECTED_LINK_ERROR');
      logDev(error);
      throw error;
    } finally {
      // The native Facebook session is only needed to mint this credential.
      if (providerOpened && provider?.clearProviderSession) {
        try {
          await provider.clearProviderSession();
        } catch {
          // Best-effort cleanup only.
        }
      }
      inProgress = false;
    }
  };
}

export type LinkFacebookToCurrentUser = ReturnType<typeof createLinkFacebookToCurrentUser>;
