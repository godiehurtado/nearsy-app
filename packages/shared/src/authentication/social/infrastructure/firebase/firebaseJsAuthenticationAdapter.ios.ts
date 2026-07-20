import {
  GoogleAuthProvider,
  signInWithCredential,
  type UserCredential,
} from 'firebase/auth';

import { firebaseAuth } from '../../../../config/firebaseConfig';
import {
  createSocialAuthError,
  messageKeyForCode,
} from '../../domain/socialAuthenticationError';
import type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
  FirebaseSocialCredentialInput,
} from './firebaseAuthenticationPort';

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

/**
 * iOS Firebase adapter using the existing Firebase JavaScript SDK (TS-007).
 */
export function createFirebaseJsAuthenticationAdapter(): FirebaseAuthenticationPort {
  return {
    async signInWithSocialCredential(
      input: FirebaseSocialCredentialInput,
    ): Promise<FirebaseAuthenticationSession> {
      if (input.provider !== 'google') {
        throw createSocialAuthError({
          code: 'CONFIGURATION_ERROR',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
          diagnosticCode: 'UNSUPPORTED_SOCIAL_PROVIDER',
        });
      }

      if (!input.idToken?.trim()) {
        throw createSocialAuthError({
          code: 'TOKEN_MISSING',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('TOKEN_MISSING'),
          diagnosticCode: 'ID_TOKEN_MISSING',
        });
      }

      try {
        const credential = GoogleAuthProvider.credential(
          input.idToken,
          input.accessToken,
        );
        const userCredential = await signInWithCredential(
          firebaseAuth as any,
          credential,
        );
        return toSession(userCredential);
      } catch (err: unknown) {
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
            provider: 'google',
            recoverable: true,
            messageKey: messageKeyForCode('ACCOUNT_CONFLICT'),
            diagnosticCode: firebaseCode,
          });
        }

        if (
          firebaseCode === 'auth/invalid-credential' ||
          firebaseCode === 'auth/invalid-id-token'
        ) {
          throw createSocialAuthError({
            code: 'TOKEN_INVALID',
            provider: 'google',
            recoverable: false,
            messageKey: messageKeyForCode('TOKEN_INVALID'),
            diagnosticCode: firebaseCode,
          });
        }

        if (firebaseCode === 'auth/network-request-failed') {
          throw createSocialAuthError({
            code: 'NETWORK_ERROR',
            provider: 'google',
            recoverable: true,
            messageKey: messageKeyForCode('NETWORK_ERROR'),
            diagnosticCode: firebaseCode,
          });
        }

        throw createSocialAuthError({
          code: 'FIREBASE_ERROR',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('FIREBASE_ERROR'),
          diagnosticCode: firebaseCode ?? 'FIREBASE_SIGN_IN_FAILED',
        });
      }
    },
  };
}
