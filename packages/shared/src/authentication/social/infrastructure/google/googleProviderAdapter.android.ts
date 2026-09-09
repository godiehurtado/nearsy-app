import type { SocialAuthenticationProviderAdapter } from '../../application/socialAuthenticationPort';
import type { SocialAuthenticationRequest } from '../../domain/socialAuthProvider';
import {
  createSocialAuthError,
  messageKeyForCode,
} from '../../domain/socialAuthenticationError';

/**
 * Android Google provider adapter is owned by the Android implementation track.
 * This stub keeps Metro resolution safe in the iOS monorepo without activating Google.
 */
export function createGoogleProviderAdapter(): SocialAuthenticationProviderAdapter {
  return {
    provider: 'google',
    async isAvailable() {
      return false;
    },
    async configure() {
      throw createSocialAuthError({
        code: 'PROVIDER_UNAVAILABLE',
        provider: 'google',
        recoverable: false,
        messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
        diagnosticCode: 'ANDROID_ADAPTER_NOT_IMPLEMENTED_IN_IOS_REPO',
      });
    },
    async authenticate(_request: SocialAuthenticationRequest) {
      throw createSocialAuthError({
        code: 'PROVIDER_UNAVAILABLE',
        provider: 'google',
        recoverable: false,
        messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
        diagnosticCode: 'ANDROID_ADAPTER_NOT_IMPLEMENTED_IN_IOS_REPO',
      });
    },
  };
}
