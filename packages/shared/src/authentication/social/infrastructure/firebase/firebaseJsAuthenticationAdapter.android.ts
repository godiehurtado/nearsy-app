import {
  createSocialAuthError,
  messageKeyForCode,
} from '../../domain/socialAuthenticationError';
import type {
  FirebaseAuthenticationPort,
  FirebaseSocialCredentialInput,
} from './firebaseAuthenticationPort';

/**
 * Android RNFirebase adapter belongs to the Android implementation track.
 */
export function createFirebaseJsAuthenticationAdapter(): FirebaseAuthenticationPort {
  return {
    async signInWithSocialCredential(_input: FirebaseSocialCredentialInput) {
      throw createSocialAuthError({
        code: 'PROVIDER_UNAVAILABLE',
        provider: 'google',
        recoverable: false,
        messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
        diagnosticCode: 'ANDROID_FIREBASE_ADAPTER_NOT_IMPLEMENTED_IN_IOS_REPO',
      });
    },
  };
}
