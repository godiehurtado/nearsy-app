/**
 * Reauthenticate the CURRENT Firebase user before account deletion.
 *
 * Uses provider adapters for Google/Apple token acquisition, then
 * `reauthenticateWithCredential` — never `signInWithCredential` /
 * `signInWithCustomToken` (those replace or fake the session).
 */
import {
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  type AuthCredential,
  type User,
} from 'firebase/auth';

import {
  SocialAuthError,
} from '../../authentication/social/domain/socialAuthenticationError';
import type { DeletionReauthMethod } from './deletionReauthMethod';

export type AccountDeletionReauthErrorCode =
  | 'CANCELLED'
  | 'IDENTITY_MISMATCH'
  | 'UNAVAILABLE'
  | 'REAUTH_FAILED'
  | 'WRONG_PASSWORD'
  | 'NETWORK'
  | 'IN_PROGRESS'
  | 'NOT_AUTHENTICATED';

export class AccountDeletionReauthError extends Error {
  readonly code: AccountDeletionReauthErrorCode;
  readonly messageKey: string;

  constructor(code: AccountDeletionReauthErrorCode, messageKey: string, message?: string) {
    super(message ?? messageKey);
    this.name = 'AccountDeletionReauthError';
    this.code = code;
    this.messageKey = messageKey;
  }
}

type GoogleProviderTokens = {
  idToken: string;
  accessToken?: string;
  providerUserId: string;
};

type AppleProviderTokens = {
  identityToken: string;
  rawNonce: string;
  providerUserId: string;
};

export type ReauthenticateForDeletionDependencies = {
  getCurrentUser: () => User | null;
  reauthenticateWithCredential: (
    user: User,
    credential: AuthCredential,
  ) => Promise<unknown>;
  createGoogleCredential: (
    idToken: string,
    accessToken?: string | null,
  ) => AuthCredential;
  createAppleCredential: (params: {
    idToken: string;
    rawNonce: string;
  }) => AuthCredential;
  obtainGoogleProviderTokens: () => Promise<GoogleProviderTokens>;
  obtainAppleProviderTokens: () => Promise<AppleProviderTokens>;
  reauthWithPassword: (password: string) => Promise<void>;
};

let inProgress = false;

function mapFirebaseReauthError(err: unknown): AccountDeletionReauthError {
  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';

  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return new AccountDeletionReauthError(
      'WRONG_PASSWORD',
      'settings.deleteAccount.reauthError',
    );
  }

  if (code === 'auth/user-mismatch' || code === 'auth/credential-already-in-use') {
    return new AccountDeletionReauthError(
      'IDENTITY_MISMATCH',
      'settings.deleteAccount.reauthMismatch',
    );
  }

  if (code === 'auth/network-request-failed') {
    return new AccountDeletionReauthError(
      'NETWORK',
      'settings.deleteAccount.error',
    );
  }

  return new AccountDeletionReauthError(
    'REAUTH_FAILED',
    'settings.deleteAccount.reauthFailed',
  );
}

function mapSocialProviderError(err: unknown): AccountDeletionReauthError {
  if (err instanceof AccountDeletionReauthError) return err;

  if (err instanceof SocialAuthError) {
    if (err.social.code === 'CANCELLED') {
      return new AccountDeletionReauthError(
        'CANCELLED',
        'settings.deleteAccount.reauthCancelled',
      );
    }
    if (err.social.code === 'IN_PROGRESS') {
      return new AccountDeletionReauthError(
        'IN_PROGRESS',
        'settings.deleteAccount.reauthFailed',
      );
    }
    if (err.social.code === 'NETWORK_ERROR') {
      return new AccountDeletionReauthError(
        'NETWORK',
        'settings.deleteAccount.error',
      );
    }
    return new AccountDeletionReauthError(
      'REAUTH_FAILED',
      'settings.deleteAccount.reauthFailed',
    );
  }

  return mapFirebaseReauthError(err);
}

async function defaultObtainGoogleTokens(): Promise<GoogleProviderTokens> {
  // Lazy import keeps Node unit tests free of the social RN entry barrel.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createDefaultSocialProviderRegistry } = require('../../authentication/social') as {
    createDefaultSocialProviderRegistry: () => {
      get: (provider: 'google') => {
        configure: () => Promise<void>;
        authenticate: (request: {
          provider: 'google';
          interactive: boolean;
        }) => Promise<{
          idToken?: string;
          accessToken?: string;
          providerUserId: string;
        }>;
      };
    };
  };
  const registry = createDefaultSocialProviderRegistry();
  const provider = registry.get('google');
  await provider.configure();
  const result = await provider.authenticate({
    provider: 'google',
    interactive: true,
  });
  if (!result.idToken?.trim()) {
    throw new AccountDeletionReauthError(
      'REAUTH_FAILED',
      'settings.deleteAccount.reauthFailed',
    );
  }
  if (!result.providerUserId?.trim()) {
    throw new AccountDeletionReauthError(
      'REAUTH_FAILED',
      'settings.deleteAccount.reauthFailed',
    );
  }
  return {
    idToken: result.idToken,
    accessToken: result.accessToken,
    providerUserId: result.providerUserId,
  };
}

async function defaultObtainAppleTokens(): Promise<AppleProviderTokens> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createDefaultSocialProviderRegistry } = require('../../authentication/social') as {
    createDefaultSocialProviderRegistry: () => {
      get: (provider: 'apple') => {
        configure: () => Promise<void>;
        authenticate: (request: {
          provider: 'apple';
          interactive: boolean;
        }) => Promise<{
          idToken?: string;
          rawNonce?: string;
          providerUserId: string;
        }>;
      };
    };
  };
  const registry = createDefaultSocialProviderRegistry();
  const provider = registry.get('apple');
  await provider.configure();
  const result = await provider.authenticate({
    provider: 'apple',
    interactive: true,
  });
  // Apple adapter stores the Apple identity token on `idToken`.
  const identityToken = result.idToken?.trim();
  const rawNonce = result.rawNonce?.trim();
  if (!identityToken || !rawNonce) {
    throw new AccountDeletionReauthError(
      'REAUTH_FAILED',
      'settings.deleteAccount.reauthFailed',
    );
  }
  if (!result.providerUserId?.trim()) {
    throw new AccountDeletionReauthError(
      'REAUTH_FAILED',
      'settings.deleteAccount.reauthFailed',
    );
  }
  return {
    identityToken,
    rawNonce,
    providerUserId: result.providerUserId,
  };
}

export function createDefaultReauthenticateForDeletionDependencies(): ReauthenticateForDeletionDependencies {
  // Lazy require avoids pulling RN Firebase config into Node unit tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { firebaseAuth } = require('../../config/firebaseConfig') as {
    firebaseAuth: { currentUser: User | null };
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { reauthWithPassword } = require('../reauth') as {
    reauthWithPassword: (password: string) => Promise<void>;
  };

  return {
    getCurrentUser: () => firebaseAuth.currentUser,
    reauthenticateWithCredential: (user, credential) =>
      reauthenticateWithCredential(user, credential),
    createGoogleCredential: (idToken, accessToken) =>
      GoogleAuthProvider.credential(idToken, accessToken),
    createAppleCredential: ({ idToken, rawNonce }) => {
      const provider = new OAuthProvider('apple.com');
      return provider.credential({ idToken, rawNonce });
    },
    obtainGoogleProviderTokens: defaultObtainGoogleTokens,
    obtainAppleProviderTokens: defaultObtainAppleTokens,
    reauthWithPassword,
  };
}

function assertProviderIdentityMatch(
  expectedLinkedId: string | undefined,
  obtainedProviderUserId: string,
): void {
  if (!expectedLinkedId) return;
  if (expectedLinkedId !== obtainedProviderUserId) {
    throw new AccountDeletionReauthError(
      'IDENTITY_MISMATCH',
      'settings.deleteAccount.reauthMismatch',
    );
  }
}

export type ReauthenticateForDeletionInput = {
  method: DeletionReauthMethod;
  password?: string;
};

/**
 * Reauthenticate the signed-in user for deletion. Does not delete the account.
 */
export async function reauthenticateForAccountDeletion(
  input: ReauthenticateForDeletionInput,
  deps: ReauthenticateForDeletionDependencies = createDefaultReauthenticateForDeletionDependencies(),
): Promise<void> {
  if (inProgress) {
    throw new AccountDeletionReauthError(
      'IN_PROGRESS',
      'settings.deleteAccount.reauthFailed',
    );
  }

  const { method } = input;

  if (method.kind === 'unavailable') {
    throw new AccountDeletionReauthError(
      'UNAVAILABLE',
      'settings.deleteAccount.reauthUnavailable',
    );
  }

  inProgress = true;
  try {
    const user = deps.getCurrentUser();
    if (!user) {
      throw new AccountDeletionReauthError(
        'NOT_AUTHENTICATED',
        'settings.deleteAccount.error',
      );
    }

    const expectedUid = user.uid;

    if (method.kind === 'password') {
      const password = input.password?.trim() ?? '';
      if (!password) {
        throw new AccountDeletionReauthError(
          'WRONG_PASSWORD',
          'settings.deleteAccount.reauthError',
        );
      }
      try {
        await deps.reauthWithPassword(password);
      } catch (err) {
        throw mapFirebaseReauthError(err);
      }
    } else if (method.kind === 'google') {
      let tokens: GoogleProviderTokens;
      try {
        tokens = await deps.obtainGoogleProviderTokens();
      } catch (err) {
        throw mapSocialProviderError(err);
      }

      assertProviderIdentityMatch(method.linkedProviderUserId, tokens.providerUserId);

      const credential = deps.createGoogleCredential(
        tokens.idToken,
        tokens.accessToken,
      );

      try {
        await deps.reauthenticateWithCredential(user, credential);
      } catch (err) {
        throw mapFirebaseReauthError(err);
      }
    } else if (method.kind === 'apple') {
      let tokens: AppleProviderTokens;
      try {
        tokens = await deps.obtainAppleProviderTokens();
      } catch (err) {
        throw mapSocialProviderError(err);
      }

      assertProviderIdentityMatch(method.linkedProviderUserId, tokens.providerUserId);

      const credential = deps.createAppleCredential({
        idToken: tokens.identityToken,
        rawNonce: tokens.rawNonce,
      });

      try {
        await deps.reauthenticateWithCredential(user, credential);
      } catch (err) {
        throw mapFirebaseReauthError(err);
      }
    }

    const after = deps.getCurrentUser();
    if (!after || after.uid !== expectedUid) {
      throw new AccountDeletionReauthError(
        'IDENTITY_MISMATCH',
        'settings.deleteAccount.reauthMismatch',
      );
    }
  } finally {
    inProgress = false;
  }
}

/** Test helper — resets the double-submit guard. */
export function __resetAccountDeletionReauthInProgressForTests() {
  inProgress = false;
}
