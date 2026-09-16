import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAuthenticateWithGoogle } from '../application/authenticateWithGoogle';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import {
  createSocialAuthError,
  messageKeyForCode,
  SocialAuthError,
} from '../domain/socialAuthenticationError';
import type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
} from '../infrastructure/firebase/firebaseAuthenticationPort';

function createMockProvider(
  overrides: Partial<SocialAuthenticationProviderAdapter> & {
    authenticateImpl?: () => Promise<ProviderAuthenticationResult>;
  } = {},
): SocialAuthenticationProviderAdapter & {
  clearCalls: number;
} {
  const state = { clearCalls: 0 };

  const adapter: SocialAuthenticationProviderAdapter & { clearCalls: number } = {
    provider: 'google',
    clearCalls: 0,
    async isAvailable() {
      return overrides.isAvailable
        ? overrides.isAvailable.call(adapter)
        : true;
    },
    async configure() {
      if (overrides.configure) {
        await overrides.configure.call(adapter);
      }
    },
    async authenticate(request) {
      if (overrides.authenticateImpl) {
        return overrides.authenticateImpl();
      }
      if (overrides.authenticate) {
        return overrides.authenticate.call(adapter, request);
      }
      return {
        provider: 'google',
        providerUserId: 'google-user-1',
        idToken: 'id-token',
        email: 'user@example.com',
      };
    },
    async clearProviderSession() {
      state.clearCalls += 1;
      adapter.clearCalls = state.clearCalls;
      if (overrides.clearProviderSession) {
        await overrides.clearProviderSession.call(adapter);
      }
    },
  };

  return adapter;
}

function createMockFirebase(
  impl?: (
    input: Parameters<FirebaseAuthenticationPort['signInWithSocialCredential']>[0],
  ) => Promise<FirebaseAuthenticationSession>,
): FirebaseAuthenticationPort & { calls: number } {
  const port = {
    calls: 0,
    async signInWithSocialCredential(input: {
      provider: 'google';
      idToken: string;
      accessToken?: string;
    }) {
      port.calls += 1;
      if (impl) return impl(input);
      return {
        uid: 'firebase-uid',
        email: 'user@example.com',
        isNewUser: false,
        linkedProviderIds: ['google.com'],
      };
    },
  };
  return port;
}

describe('authenticateWithGoogle', () => {
  it('completes provider + Firebase auth and routes to MainTabs when profile is complete', async () => {
    const provider = createMockProvider();
    const firebaseAuth = createMockFirebase();
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({ google: provider }),
      firebaseAuth,
      getUserProfile: async () => ({ realName: 'Ada' }),
      isProfileComplete: async () => true,
    });

    const result = await authenticate();

    assert.equal(result.profileRoute, 'MainTabs');
    assert.equal(result.session.uid, 'firebase-uid');
    assert.equal(firebaseAuth.calls, 1);
  });

  it('routes to CompleteProfile when profile is incomplete', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({ google: createMockProvider() }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ realName: '' }),
      isProfileComplete: async () => false,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
  });

  it('routes to CompleteProfile when profile is missing', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({ google: createMockProvider() }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => {
        throw new Error('should not be called when profile is missing');
      },
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(result.email, 'user@example.com');
  });

  it('propagates successful provider authentication result into Firebase credential input', async () => {
    let capturedToken: string | undefined;
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          authenticateImpl: async () => ({
            provider: 'google',
            providerUserId: 'g-1',
            idToken: 'provider-id-token',
            accessToken: 'access',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(async (input) => {
        capturedToken = input.idToken;
        assert.equal(input.accessToken, 'access');
        return {
          uid: 'uid-1',
          email: 'a@b.com',
          isNewUser: true,
          linkedProviderIds: ['google.com'],
        };
      }),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await authenticate();
    assert.equal(capturedToken, 'provider-id-token');
  });

  it('maps user cancellation without treating it as a generic failure', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          authenticateImpl: async () => {
            throw createSocialAuthError({
              code: 'CANCELLED',
              provider: 'google',
              recoverable: true,
              messageKey: messageKeyForCode('CANCELLED'),
            });
          },
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'CANCELLED',
    );
  });

  it('rejects when ID token is missing', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          authenticateImpl: async () => ({
            provider: 'google',
            providerUserId: 'g-1',
            idToken: '   ',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'TOKEN_MISSING',
    );
  });

  it('protects against in-progress duplicate execution', async () => {
    let release!: () => void;
    const gate = new Promise<ProviderAuthenticationResult>((resolve) => {
      release = () =>
        resolve({
          provider: 'google',
          providerUserId: 'g-1',
          idToken: 'token',
        });
    });

    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          authenticateImpl: async () => gate,
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ ok: true }),
      isProfileComplete: async () => true,
    });

    const first = authenticate();
    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'IN_PROGRESS',
    );

    release();
    const result = await first;
    assert.equal(result.profileRoute, 'MainTabs');
  });

  it('maps provider unavailable', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          async isAvailable() {
            return false;
          },
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'PROVIDER_UNAVAILABLE',
    );
  });

  it('maps configuration failure from provider.configure', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          async configure() {
            throw createSocialAuthError({
              code: 'CONFIGURATION_ERROR',
              provider: 'google',
              recoverable: false,
              messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
            });
          },
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'CONFIGURATION_ERROR',
    );
  });

  it('maps network failure from Firebase', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({ google: createMockProvider() }),
      firebaseAuth: createMockFirebase(async () => {
        throw createSocialAuthError({
          code: 'NETWORK_ERROR',
          provider: 'google',
          recoverable: true,
          messageKey: messageKeyForCode('NETWORK_ERROR'),
        });
      }),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'NETWORK_ERROR',
    );
  });

  it('normalizes account conflict and clears native Google session after Firebase failure', async () => {
    const provider = createMockProvider();
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({ google: provider }),
      firebaseAuth: createMockFirebase(async () => {
        throw createSocialAuthError({
          code: 'ACCOUNT_CONFLICT',
          provider: 'google',
          recoverable: true,
          messageKey: messageKeyForCode('ACCOUNT_CONFLICT'),
        });
      }),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'ACCOUNT_CONFLICT',
    );
    assert.equal(provider.clearCalls, 1);
  });

  it('normalizes unknown errors and resets in-progress so a retry can run', async () => {
    let failOnce = true;
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          authenticateImpl: async () => {
            if (failOnce) {
              failOnce = false;
              throw new Error('boom');
            }
            return {
              provider: 'google',
              providerUserId: 'g-1',
              idToken: 'token',
            };
          },
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ ok: true }),
      isProfileComplete: async () => true,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'UNKNOWN',
    );

    const result = await authenticate();
    assert.equal(result.profileRoute, 'MainTabs');
  });
});
