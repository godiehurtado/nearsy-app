import {
  FacebookAuthProvider,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type AdditionalUserInfo,
  type UserCredential,
} from 'firebase/auth';

import {
  createSocialAuthError,
  messageKeyForCode,
} from '../../domain/socialAuthenticationError';
import { selectFacebookCredentialTokens } from '../../domain/facebookCredentialPolicy';
import type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
  FirebaseSocialCredentialInput,
} from './firebaseAuthenticationPort';
import {
  describeErrorForTrace,
  inspectFirebaseFacebookCredentialForTrace,
  isFacebookAuthTraceEnabled,
  traceFacebookAuth,
  type AdditionalUserInfoForTrace,
  type FirebaseCredentialForTrace,
} from '../../application/facebookAuthTrace';

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
  FacebookAuthProvider: {
    credential: (accessToken: string) => unknown;
  };
  signInWithCredential: (
    auth: unknown,
    credential: unknown,
  ) => Promise<UserCredential>;
  /** Modular SDK: UserCredential has no `additionalUserInfo` property. */
  getAdditionalUserInfo: (cred: UserCredential) => AdditionalUserInfo | null;
  auth: unknown;
};

type ReadAdditionalUserInfo = FirebaseJsAuthRuntime['getAdditionalUserInfo'];

function safeAdditionalUserInfo(
  read: ReadAdditionalUserInfo,
  cred: UserCredential,
): AdditionalUserInfo | null {
  try {
    return read(cred);
  } catch {
    return null;
  }
}

function toSession(
  cred: UserCredential,
  readAdditional: ReadAdditionalUserInfo,
): FirebaseAuthenticationSession {
  const user = cred.user;
  const linkedProviderIds = user.providerData
    .map((entry) => entry.providerId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return {
    uid: user.uid,
    email: user.email ?? undefined,
    isNewUser: safeAdditionalUserInfo(readAdditional, cred)?.isNewUser === true,
    linkedProviderIds,
  };
}

export function mapFirebaseSocialError(
  provider: 'google' | 'apple' | 'facebook',
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
 * Supports Google, Apple and Facebook social credentials — no email-based linking.
 */
export function createFirebaseJsAuthenticationAdapter(
  runtimeOverrides?: Partial<FirebaseJsAuthRuntime>,
): FirebaseAuthenticationPort {
  const resolveAuth = () =>
    runtimeOverrides?.auth ?? resolveDefaultAuth();
  const readAdditional: ReadAdditionalUserInfo =
    runtimeOverrides?.getAdditionalUserInfo ?? getAdditionalUserInfo;

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
          return toSession(userCredential, readAdditional);
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
          return toSession(userCredential, readAdditional);
        } catch (err: unknown) {
          mapFirebaseSocialError('apple', err);
        }
      }

      if (input.provider === 'facebook') {
        const accessToken = input.accessToken?.trim();
        const idToken = input.idToken?.trim();
        const rawNonce = input.rawNonce?.trim();

        if (!accessToken && !idToken) {
          throw createSocialAuthError({
            code: 'TOKEN_MISSING',
            provider: 'facebook',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_MISSING'),
            diagnosticCode: 'FACEBOOK_TOKEN_MISSING',
          });
        }

        if (!accessToken && !rawNonce) {
          throw createSocialAuthError({
            code: 'TOKEN_INVALID',
            provider: 'facebook',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_INVALID'),
            diagnosticCode: 'RAW_NONCE_MISSING',
          });
        }

        const Facebook =
          runtimeOverrides?.FacebookAuthProvider ?? FacebookAuthProvider;
        const FacebookOAuth = runtimeOverrides?.OAuthProvider ?? OAuthProvider;
        const signIn =
          runtimeOverrides?.signInWithCredential ??
          (signInWithCredential as FirebaseJsAuthRuntime['signInWithCredential']);

        const tokens = selectFacebookCredentialTokens({ accessToken, idToken, rawNonce });

        let auth: unknown;
        try {
          const credential =
            tokens?.kind === 'access_token'
              ? Facebook.credential(tokens.accessToken)
              : new FacebookOAuth('facebook.com').credential({
                  idToken,
                  rawNonce,
                });
          const cred = credential as {
            providerId?: unknown;
            signInMethod?: unknown;
            idToken?: unknown;
            accessToken?: unknown;
            nonce?: unknown;
          };
          traceFacebookAuth('firebase_credential_created', {
            tokenKind: tokens?.kind === 'access_token' ? 'access_token' : 'oidc_id_token',
            providerId: typeof cred.providerId === 'string' ? cred.providerId : 'missing',
            signInMethod: typeof cred.signInMethod === 'string' ? cred.signInMethod : 'missing',
            credentialHasIdToken: typeof cred.idToken === 'string' && cred.idToken.length > 0,
            credentialHasAccessToken:
              typeof cred.accessToken === 'string' && cred.accessToken.length > 0,
            credentialNonceIsRawNonce: Boolean(rawNonce) && cred.nonce === rawNonce,
          });

          auth = resolveAuth();
          const appOptions = (auth as { app?: { options?: { projectId?: unknown } } })?.app
            ?.options;
          traceFacebookAuth('firebase_sign_in_started', {
            projectId:
              typeof appOptions?.projectId === 'string' ? appOptions.projectId : 'missing',
          });
          const userCredential = await signIn(auth, credential);
          const session = toSession(userCredential, readAdditional);
          traceFacebookAuth(
            'firebase_sign_in_success',
            isFacebookAuthTraceEnabled()
              ? inspectFirebaseFacebookCredentialForTrace(
                  userCredential as FirebaseCredentialForTrace,
                  safeAdditionalUserInfo(readAdditional, userCredential) as AdditionalUserInfoForTrace,
                )
              : undefined,
          );
          return session;
        } catch (err: unknown) {
          traceFacebookAuth('firebase_sign_in_error', {
            ...describeErrorForTrace(err),
            currentUserPresent: Boolean(
              (auth as { currentUser?: unknown } | undefined)?.currentUser,
            ),
          });
          mapFirebaseSocialError('facebook', err);
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
