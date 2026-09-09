import type { SocialAuthenticationProviderAdapter } from './socialAuthenticationPort';
import type { SocialAuthProvider } from '../domain/socialAuthProvider';
import {
  createSocialAuthError,
  messageKeyForCode,
} from '../domain/socialAuthenticationError';

export interface SocialProviderRegistry {
  get(provider: SocialAuthProvider): SocialAuthenticationProviderAdapter;
  isRegistered(provider: SocialAuthProvider): boolean;
  listRegistered(): SocialAuthProvider[];
}

export function createSocialProviderRegistry(
  adapters: Partial<
    Record<SocialAuthProvider, SocialAuthenticationProviderAdapter>
  >,
): SocialProviderRegistry {
  return {
    isRegistered(provider) {
      return Boolean(adapters[provider]);
    },
    listRegistered() {
      return (Object.keys(adapters) as SocialAuthProvider[]).filter(
        (key) => adapters[key] != null,
      );
    },
    get(provider) {
      const adapter = adapters[provider];
      if (!adapter) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider,
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'PROVIDER_NOT_REGISTERED',
        });
      }
      return adapter;
    },
  };
}
