import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { createAuthenticateWithApple } from '../application/authenticateWithApple';
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
  FirebaseSocialCredentialInput,
} from '../infrastructure/firebase/firebaseAuthenticationPort';
import {
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
} from '../application/socialProfilePrefillStore';

function createMockAppleProvider(
  overrides: Partial<SocialAuthenticationProviderAdapter> & {
    authenticateImpl?: () => Promise<ProviderAuthenticationResult>;
  } = {},
): SocialAuthenticationProviderAdapter & { clearCalls: number } {
  const state = { clearCalls: 0 };
  const adapter: SocialAuthenticationProviderAdapter & { clearCalls: number } = {
    provider: 'apple',
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
        provider: 'apple',
        providerUserId: 'apple-user-1',
        idToken: 'identity-token',
        rawNonce: 'raw-nonce',
        email: 'apple@example.com',
        displayName: 'Ada Lovelace',
        givenName: 'Ada',
        familyName: 'Lovelace',
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
    input: FirebaseSocialCredentialInput,
  ) => Promise<FirebaseAuthenticationSession>,
): FirebaseAuthenticationPort & {
  calls: number;
  lastInput?: FirebaseSocialCredentialInput;
} {
  const port = {
    calls: 0,
    lastInput: undefined as FirebaseSocialCredentialInput | undefined,
    async signInWithSocialCredential(input: FirebaseSocialCredentialInput) {
      port.calls += 1;
      port.lastInput = input;
      if (impl) return impl(input);
      return {
        uid: 'firebase-uid',
        email: 'apple@example.com',
        isNewUser: false,
        linkedProviderIds: ['apple.com'],
      };
    },
  };
  return port;
}

function createPersistTracker() {
  const writes: Array<{ uid: string; realName: string }> = [];
  return {
    writes,
    persistEmptyRealName: async (uid: string, realName: string) => {
      writes.push({ uid, realName });
    },
  };
}

describe('authenticateWithApple', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  it('writes early realName for full Apple name on new profile', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.deepEqual(persist.writes, [
      { uid: 'firebase-uid', realName: 'Ada Lovelace' },
    ]);
    assert.equal(peekPendingSocialProfilePrefill()?.uid, 'firebase-uid');
  });

  it('persists givenName-only as valid realName', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => ({
            provider: 'apple',
            providerUserId: 'a-1',
            idToken: 'token',
            rawNonce: 'nonce',
            givenName: 'Ada',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await authenticate();
    assert.deepEqual(persist.writes, [
      { uid: 'firebase-uid', realName: 'Ada' },
    ]);
  });

  it('persists familyName-only as valid realName', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => ({
            provider: 'apple',
            providerUserId: 'a-1',
            idToken: 'token',
            rawNonce: 'nonce',
            familyName: 'Lovelace',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await authenticate();
    assert.deepEqual(persist.writes, [
      { uid: 'firebase-uid', realName: 'Lovelace' },
    ]);
  });

  it('does not persist when Apple fullName is null/absent', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => ({
            provider: 'apple',
            providerUserId: 'a-1',
            idToken: 'token',
            rawNonce: 'nonce',
            email: 'relay@privaterelay.appleid.com',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(async () => ({
        uid: 'uid-no-name',
        email: 'relay@privaterelay.appleid.com',
        isNewUser: true,
        linkedProviderIds: ['apple.com'],
      })),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill()?.uid, 'uid-no-name');
  });

  it('normalizes whitespace before early realName persist', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => ({
            provider: 'apple',
            providerUserId: 'a-1',
            idToken: 'token',
            rawNonce: 'nonce',
            givenName: '  Ada  ',
            familyName: '  Lovelace  ',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await authenticate();
    assert.deepEqual(persist.writes, [
      { uid: 'firebase-uid', realName: 'Ada Lovelace' },
    ]);
  });

  it('does not overwrite an existing non-empty realName', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({
        realName: 'Persisted Name',
        profileSetupCompleted: false,
      }),
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill()?.uid, 'firebase-uid');
  });

  it('routes new profile to CompleteProfile and keeps pending prefill', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => {
        throw new Error('should not be called when profile is missing');
      },
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(result.session.uid, 'firebase-uid');
    const pending = peekPendingSocialProfilePrefill();
    assert.equal(pending?.uid, 'firebase-uid');
    assert.equal(pending?.socialProfile.email, 'apple@example.com');
    assert.equal(pending?.socialProfile.displayName, 'Ada Lovelace');
    assert.equal(persist.writes.length, 1);
  });

  it('routes complete profiles to MainTabs without overwriting realName', async () => {
    const persist = createPersistTracker();
    let completeChecked = false;
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({
        realName: 'Ada',
        profileSetupCompleted: true,
      }),
      isProfileComplete: async () => {
        completeChecked = true;
        return true;
      },
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(completeChecked, true);
    assert.equal(result.profileRoute, 'MainTabs');
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('continues auth and ProfileCompletion when early persist fails', async () => {
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: async () => {
        throw new Error('firestore unavailable');
      },
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(result.session.uid, 'firebase-uid');
    assert.equal(peekPendingSocialProfilePrefill()?.uid, 'firebase-uid');
    assert.equal(
      peekPendingSocialProfilePrefill()?.socialProfile.givenName,
      'Ada',
    );
  });

  it('keeps pending prefill available for UI after early persist', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ realName: '   ' }),
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await authenticate();
    assert.deepEqual(persist.writes, [
      { uid: 'firebase-uid', realName: 'Ada Lovelace' },
    ]);
    assert.equal(peekPendingSocialProfilePrefill()?.socialProfile.familyName, 'Lovelace');
  });

  it('routes incomplete persisted profiles to CompleteProfile', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ realName: '' }),
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(peekPendingSocialProfilePrefill()?.uid, 'firebase-uid');
    assert.deepEqual(persist.writes, [
      { uid: 'firebase-uid', realName: 'Ada Lovelace' },
    ]);
  });

  it('supports partial Apple profile data for prefill without inventing photo', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => ({
            provider: 'apple',
            providerUserId: 'apple-user-partial',
            idToken: 'identity-token',
            rawNonce: 'raw-nonce',
          }),
        }),
      }),
      firebaseAuth: createMockFirebase(async () => ({
        uid: 'uid-partial',
        email: 'fallback@firebase.example',
        isNewUser: true,
        linkedProviderIds: ['apple.com'],
      })),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(persist.writes.length, 0);
    const pending = peekPendingSocialProfilePrefill();
    assert.equal(pending?.uid, 'uid-partial');
    assert.equal(pending?.socialProfile.email, 'fallback@firebase.example');
    assert.equal(pending?.socialProfile.photoUrl, undefined);
  });

  it('does not overwrite persisted profile documents beyond empty realName', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({
        realName: 'Persisted Name',
        email: 'persisted@example.com',
      }),
      isProfileComplete: async () => true,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await authenticate();
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('passes Apple identityToken + rawNonce to Firebase (discriminated union)', async () => {
    const firebaseAuth = createMockFirebase();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => ({
            provider: 'apple',
            providerUserId: 'a-1',
            idToken: 'id-token-from-apple',
            rawNonce: 'raw-from-apple',
          }),
        }),
      }),
      firebaseAuth,
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    await authenticate();
    assert.deepEqual(firebaseAuth.lastInput, {
      provider: 'apple',
      identityToken: 'id-token-from-apple',
      rawNonce: 'raw-from-apple',
    });
  });

  it('blocks concurrent double execution', async () => {
    let release!: () => void;
    const gate = new Promise<ProviderAuthenticationResult>((resolve) => {
      release = () =>
        resolve({
          provider: 'apple',
          providerUserId: 'a-1',
          idToken: 'token',
          rawNonce: 'nonce',
        });
    });

    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => gate,
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ ok: true, realName: 'X' }),
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

  it('does not create Firebase session or prefill on cancellation', async () => {
    const firebaseAuth = createMockFirebase();
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => {
            throw createSocialAuthError({
              code: 'CANCELLED',
              provider: 'apple',
              recoverable: true,
              messageKey: messageKeyForCode('CANCELLED'),
            });
          },
        }),
      }),
      firebaseAuth,
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'CANCELLED',
    );
    assert.equal(firebaseAuth.calls, 0);
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('does not create Firebase session when secure nonce generation fails', async () => {
    const firebaseAuth = createMockFirebase();
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider({
          authenticateImpl: async () => {
            throw createSocialAuthError({
              code: 'CONFIGURATION_ERROR',
              provider: 'apple',
              recoverable: false,
              messageKey: messageKeyForCode('CONFIGURATION_ERROR'),
              diagnosticCode: 'APPLE_NONCE_GENERATION_FAILED',
            });
          },
        }),
      }),
      firebaseAuth,
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'CONFIGURATION_ERROR' &&
        err.social.diagnosticCode === 'APPLE_NONCE_GENERATION_FAILED',
    );
    assert.equal(firebaseAuth.calls, 0);
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('does not create prefill when Firebase authentication fails', async () => {
    const persist = createPersistTracker();
    const authenticate = createAuthenticateWithApple({
      registry: createSocialProviderRegistry({
        apple: createMockAppleProvider(),
      }),
      firebaseAuth: createMockFirebase(async () => {
        throw createSocialAuthError({
          code: 'ACCOUNT_CONFLICT',
          provider: 'apple',
          recoverable: true,
          messageKey: messageKeyForCode('ACCOUNT_CONFLICT'),
        });
      }),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
      persistEmptyRealName: persist.persistEmptyRealName,
    });

    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'ACCOUNT_CONFLICT',
    );
    assert.equal(persist.writes.length, 0);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });
});
