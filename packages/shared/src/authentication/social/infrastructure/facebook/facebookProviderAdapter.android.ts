import type { SocialAuthenticationProviderAdapter } from '../../application/socialAuthenticationPort';
import type { SocialAuthenticationRequest } from '../../domain/socialAuthProvider';
import {
  createSocialAuthError,
  messageKeyForCode,
} from '../../domain/socialAuthenticationError';

export const FACEBOOK_LOGIN_PERMISSIONS: readonly string[] = Object.freeze([
  'public_profile',
  'email',
]);

function unavailable() {
  return createSocialAuthError({
    code: 'PROVIDER_UNAVAILABLE',
    provider: 'facebook',
    recoverable: false,
    messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
    diagnosticCode: 'ANDROID_ADAPTER_NOT_IMPLEMENTED_IN_IOS_REPO',
  });
}

export function mapFacebookSdkError(_err: unknown) {
  return unavailable();
}

/**
 * Android Facebook adapter is owned by the Android implementation track.
 * This stub keeps Metro resolution safe without loading the Facebook SDK.
 */
export function createFacebookProviderAdapter(
  _deps?: unknown,
): SocialAuthenticationProviderAdapter {
  return {
    provider: 'facebook',
    async isAvailable() {
      return false;
    },
    async configure() {
      throw unavailable();
    },
    async authenticate(_request: SocialAuthenticationRequest) {
      throw unavailable();
    },
    async clearProviderSession() {
      // No Facebook session exists on this platform.
    },
  };
}
