import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type UserCredential,
} from 'firebase/auth';

import {
  createSocialAuthError,
  messageKeyForCode,
} from '../../domain/socialAuthenticationError';
import type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
  FirebaseSocialCredentialInput,
} from './firebaseAuthenticationPort';

/** Injectable runtime for unit tests (defaults to Firebase JS SDK). */
export type FirebaseJsAuthRuntime = {
  GoogleAuthProvider: {
    credential: (
      idToken: string | null,
      accessToken?: string | null,
    ) => unknown;
  };
  OAuthProvider: new (providerId: string) => {
    credential: (params: {
      idToken?: string;
      rawNonce?: string;
    }) => unknown;
  };
  signInWithCredential: (
    auth: unknown,
    credential: unknown,
  ) => Promise<UserCredential>;
  auth: unknown;
};

function toSession(cred: UserCredential): FirebaseAuthenticationSession {
  const user = cred.user;
  const linkedProviderIds = user.providerData
    .map((entry) => entry.providerId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return {
    uid: user.uid,
    email: user.email ?? undefined,
    isNewUser: Boolean(
      (cred as UserCredential & { additionalUserInfo?: { isNewUser?: boolean } })
        .additionalUserInfo?.isNewUser,
    ),
    linkedProviderIds,
  };
}

export function mapFirebaseSocialError(
  provider: 'google' | 'apple',
  err: unknown,
): never {
  const firebaseCode =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : undefined;

  if (firebaseCode === 'auth/account-exists-with-different-credential') {
    throw createSocialAuthError({
      code: 'ACCOUNT_CONFLICT',
      provider,
      recoverable: true,
      messageKey: messageKeyForCode('ACCOUNT_CONFLICT'),
      diagnosticCode: firebaseCode,
    });
  }

  if (
    firebaseCode === 'auth/invalid-credential' ||
    firebaseCode === 'auth/invalid-id-token' ||
    firebaseCode === 'auth/missing-or-invalid-nonce'
  ) {
    throw createSocialAuthError({
      code: 'TOKEN_INVALID',
      provider,
      recoverable: false,
      messageKey: messageKeyForCode('TOKEN_INVALID'),
      diagnosticCode: firebaseCode,
    });
  }

  if (firebaseCode === 'auth/network-request-failed') {
    throw createSocialAuthError({
      code: 'NETWORK_ERROR',
      provider,
      recoverable: true,
      messageKey: messageKeyForCode('NETWORK_ERROR'),
      diagnosticCode: firebaseCode,
    });
  }

  throw createSocialAuthError({
    code: 'FIREBASE_ERROR',
    provider,
    recoverable: false,
    messageKey: messageKeyForCode('FIREBASE_ERROR'),
    diagnosticCode: firebaseCode ?? 'FIREBASE_SIGN_IN_FAILED',
  });
}

function resolveDefaultAuth(): unknown {
  // Lazy require avoids pulling RN Firebase config into Node unit tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../../../config/firebaseConfig') as {
    firebaseAuth: unknown;
  };
  return mod.firebaseAuth as any;
}

/**
 * iOS Firebase adapter using the existing Firebase JavaScript SDK (TS-007).
 * Supports Google and Apple social credentials only — no email-based linking.
 */
export function createFirebaseJsAuthenticationAdapter(
  runtimeOverrides?: Partial<FirebaseJsAuthRuntime>,
): FirebaseAuthenticationPort {
  const resolveAuth = () =>
    runtimeOverrides?.auth ?? resolveDefaultAuth();

  return {
    async signInWithSocialCredential(
      input: FirebaseSocialCredentialInput,
    ): Promise<FirebaseAuthenticationSession> {
      if (input.provider === 'google') {
        if (!input.idToken?.trim()) {
          throw createSocialAuthError({
            code: 'TOKEN_MISSING',
            provider: 'google',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_MISSING'),
            diagnosticCode: 'ID_TOKEN_MISSING',
          });
        }

        const Google = runtimeOverrides?.GoogleAuthProvider ?? GoogleAuthProvider;
        const signIn =
          runtimeOverrides?.signInWithCredential ??
          (signInWithCredential as FirebaseJsAuthRuntime['signInWithCredential']);

        try {
          const credential = Google.credential(
            input.idToken,
            input.accessToken,
          );
          const userCredential = await signIn(resolveAuth(), credential);
          return toSession(userCredential);
        } catch (err: unknown) {
          mapFirebaseSocialError('google', err);
        }
      }

      if (input.provider === 'apple') {
        if (!input.identityToken?.trim()) {
          throw createSocialAuthError({
            code: 'TOKEN_MISSING',
            provider: 'apple',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_MISSING'),
            diagnosticCode: 'IDENTITY_TOKEN_MISSING',
          });
        }

        if (!input.rawNonce?.trim()) {
          throw createSocialAuthError({
            code: 'TOKEN_INVALID',
            provider: 'apple',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_INVALID'),
            diagnosticCode: 'RAW_NONCE_MISSING',
          });
        }

        const AppleOAuth = runtimeOverrides?.OAuthProvider ?? OAuthProvider;
        const signIn =
          runtimeOverrides?.signInWithCredential ??
          (signInWithCredential as FirebaseJsAuthRuntime['signInWithCredential']);

        try {
          const provider = new AppleOAuth('apple.com');
          const credential = provider.credential({
            idToken: input.identityToken,
            rawNonce: input.rawNonce,
          });
          const userCredential = await signIn(resolveAuth(), credential);
          return toSession(userCredential);
        } catch (err: unknown) {
          mapFirebaseSocialError('apple', err);
        }
      }

      // Exhaustiveness guard for future providers.
      throw createSocialAuthError({
        code: 'CONFIGURATION_ERROR',
        provider: 'google',
        recoverable: false,
        messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
        diagnosticCode: 'UNSUPPORTED_SOCIAL_PROVIDER',
      });
    },
  };
}
