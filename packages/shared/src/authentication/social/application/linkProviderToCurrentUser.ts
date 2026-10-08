import type { SocialAuthenticationProviderAdapter } from './socialAuthenticationPort';
import type { SocialProviderRegistry } from './providerRegistry';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import { SocialAuthError } from '../domain/socialAuthenticationError';
import { selectFacebookCredentialTokens } from '../domain/facebookCredentialPolicy';
import {
  AccountLinkError,
  FIREBASE_PROVIDER_ALREADY_LINKED_CODE,
  LINKABLE_PROVIDER_IDS,
  mapFirebaseLinkError,
  readFirebaseErrorCode,
  type LinkableProvider,
} from '../domain/accountLinkError';
import type {
  FirebaseAccountLinkingPort,
  LinkCredentialInput,
  LinkedAccountSnapshot,
} from '../infrastructure/firebase/firebaseAccountLinkingPort';

export type AccountLinkOutcome = {
  provider: LinkableProvider;
  status: 'linked' | 'already_linked';
  providerIds: readonly string[];
};

export interface LinkProviderToCurrentUserDependencies {
  registry: SocialProviderRegistry;
  accountLinking: FirebaseAccountLinkingPort;
}

export interface LinkProviderToCurrentUserRequest {
  /** Explicit user confirmation; resolved `false` cancels silently. */
  confirm: () => Promise<boolean>;
}

const trimmed = (value: string | undefined) => {
  const v = value?.trim();
  return v ? v : undefined;
};

/**
 * Fresh provider result → in-memory link credential. Requirements per provider:
 * Google needs an ID token; Apple needs identity token + raw nonce; Facebook
 * needs the Limited Login OIDC pair (no classic AccessToken path).
 * Name and email are never required.
 */
export function toLinkCredential(
  provider: LinkableProvider,
  result: ProviderAuthenticationResult,
): LinkCredentialInput {
  if (provider === 'google') {
    const idToken = trimmed(result.idToken);
    if (!idToken) throw new AccountLinkError('TOKEN_MISSING', provider, 'GOOGLE_ID_TOKEN_MISSING');
    const accessToken = trimmed(result.accessToken);
    return { provider, idToken, ...(accessToken ? { accessToken } : {}) };
  }
  if (provider === 'apple') {
    const idToken = trimmed(result.idToken);
    if (!idToken) throw new AccountLinkError('TOKEN_MISSING', provider, 'APPLE_IDENTITY_TOKEN_MISSING');
    const rawNonce = trimmed(result.rawNonce);
    if (!rawNonce) throw new AccountLinkError('TOKEN_INVALID', provider, 'APPLE_RAW_NONCE_MISSING');
    return { provider, idToken, rawNonce };
  }
  const tokens = selectFacebookCredentialTokens(result);
  if (!tokens) throw new AccountLinkError('TOKEN_MISSING', provider, 'FACEBOOK_TOKEN_MISSING');
  if (tokens.kind !== 'oidc') {
    throw new AccountLinkError('TOKEN_MISSING', provider, 'FACEBOOK_OIDC_TOKEN_REQUIRED');
  }
  return { provider, idToken: tokens.idToken, rawNonce: tokens.rawNonce };
}

function mapProviderError(provider: LinkableProvider, err: unknown): AccountLinkError {
  if (err instanceof AccountLinkError) return err;
  if (!(err instanceof SocialAuthError)) {
    return new AccountLinkError('UNKNOWN', provider, 'PROVIDER_FAILED');
  }
  const diagnostic = err.social.diagnosticCode ?? err.social.code;
  switch (err.social.code) {
    case 'CANCELLED':
      return new AccountLinkError('CANCELLED', provider, diagnostic);
    case 'IN_PROGRESS':
      return new AccountLinkError('IN_PROGRESS', provider, diagnostic);
    case 'NETWORK_ERROR':
      return new AccountLinkError('NETWORK_ERROR', provider, diagnostic);
    case 'TOKEN_MISSING':
      return new AccountLinkError('TOKEN_MISSING', provider, diagnostic);
    case 'TOKEN_INVALID':
      return new AccountLinkError('TOKEN_INVALID', provider, diagnostic);
    case 'PROVIDER_UNAVAILABLE':
    case 'CONFIGURATION_ERROR':
      return new AccountLinkError('PROVIDER_UNAVAILABLE', provider, diagnostic);
    default:
      return new AccountLinkError('UNKNOWN', provider, diagnostic);
  }
}

function logDev(error: AccountLinkError): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[linkProviderToCurrentUser]', {
      provider: error.provider,
      code: error.code,
      diagnosticCode: error.diagnosticCode,
    });
  }
}

/**
 * Explicit "Connect Google / Apple / Facebook" for the signed-in Nearsy user:
 * current user → captured UID → confirmation → fresh provider credential →
 * `linkWithCredential(currentUser)` → UID check → reload → providerId check.
 *
 * One attempt at a time across all providers. Never signs in, never creates
 * or merges users, never looks up accounts by email and keeps the credential
 * in memory only for this attempt.
 */
export function createLinkProviderToCurrentUser(
  deps: LinkProviderToCurrentUserDependencies,
) {
  let inProgress = false;

  return async function linkProviderToCurrentUser(
    provider: LinkableProvider,
    request: LinkProviderToCurrentUserRequest,
  ): Promise<AccountLinkOutcome> {
    if (inProgress) {
      throw new AccountLinkError('IN_PROGRESS', provider, 'LINK_IN_PROGRESS');
    }

    inProgress = true;
    const providerId = LINKABLE_PROVIDER_IDS[provider];
    const hasProvider = (snapshot: LinkedAccountSnapshot | null) =>
      !!snapshot && snapshot.providerIds.includes(providerId);

    let adapter: SocialAuthenticationProviderAdapter | undefined;
    let providerOpened = false;
    let succeeded = false;

    try {
      const before = deps.accountLinking.getCurrentAccount();
      if (!before) {
        throw new AccountLinkError('NOT_AUTHENTICATED', provider, 'NO_CURRENT_USER');
      }
      const initialUid = before.uid;

      if (hasProvider(before)) {
        succeeded = true;
        return { provider, status: 'already_linked', providerIds: before.providerIds };
      }

      if (!(await request.confirm())) {
        throw new AccountLinkError('CANCELLED', provider, 'LINK_CONFIRMATION_DECLINED');
      }

      if (!deps.registry.isRegistered(provider)) {
        throw new AccountLinkError('PROVIDER_UNAVAILABLE', provider, 'PROVIDER_NOT_REGISTERED');
      }

      let result: ProviderAuthenticationResult;
      try {
        adapter = deps.registry.get(provider);
        providerOpened = true;
        await adapter.configure();
        result = await adapter.authenticate({ provider, interactive: true });
      } catch (err) {
        throw mapProviderError(provider, err);
      }

      const credential = toLinkCredential(provider, result);

      let linked: LinkedAccountSnapshot;
      try {
        linked = await deps.accountLinking.linkProviderCredential({
          expectedUid: initialUid,
          credential,
        });
      } catch (err) {
        if (readFirebaseErrorCode(err) === FIREBASE_PROVIDER_ALREADY_LINKED_CODE) {
          const refreshed = await deps.accountLinking.reloadCurrentAccount();
          if (refreshed && refreshed.uid === initialUid && hasProvider(refreshed)) {
            succeeded = true;
            return { provider, status: 'already_linked', providerIds: refreshed.providerIds };
          }
          throw new AccountLinkError('UNKNOWN', provider, FIREBASE_PROVIDER_ALREADY_LINKED_CODE);
        }
        throw mapFirebaseLinkError(provider, err);
      }

      if (linked.uid !== initialUid) {
        throw new AccountLinkError('IDENTITY_CHANGED', provider, 'UID_CHANGED_AFTER_LINK');
      }

      const refreshed = await deps.accountLinking.reloadCurrentAccount();
      if (!refreshed || refreshed.uid !== initialUid) {
        throw new AccountLinkError('IDENTITY_CHANGED', provider, 'UID_CHANGED_AFTER_RELOAD');
      }
      if (!hasProvider(refreshed)) {
        throw new AccountLinkError('UNKNOWN', provider, 'PROVIDER_MISSING_AFTER_RELOAD');
      }

      succeeded = true;
      return { provider, status: 'linked', providerIds: refreshed.providerIds };
    } catch (err) {
      const error =
        err instanceof AccountLinkError
          ? err
          : new AccountLinkError('UNKNOWN', provider, 'UNEXPECTED_LINK_ERROR');
      logDev(error);
      throw error;
    } finally {
      // Facebook's native session only exists to mint this credential; Google's
      // SDK state is cleared only after a cancelled or failed attempt.
      const shouldClear = providerOpened && (provider === 'facebook' || !succeeded);
      if (shouldClear && adapter?.clearProviderSession) {
        try {
          await adapter.clearProviderSession();
        } catch {
          // Best-effort cleanup only.
        }
      }
      inProgress = false;
    }
  };
}

export type LinkProviderToCurrentUser = ReturnType<typeof createLinkProviderToCurrentUser>;
