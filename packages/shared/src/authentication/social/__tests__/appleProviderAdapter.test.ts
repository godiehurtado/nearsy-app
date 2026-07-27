import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  APPLE_RAW_NONCE_CHARSET,
  APPLE_RAW_NONCE_LENGTH,
  createAppleProviderAdapter,
} from '../infrastructure/apple/appleProviderAdapter.ios';
import type {
  AppleAuthenticationClient,
  AppleCryptoClient,
} from '../infrastructure/apple/appleProviderAdapter.ios';
import { SocialAuthError } from '../domain/socialAuthenticationError';

const adapterSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../infrastructure/apple/appleProviderAdapter.ios.ts',
);

function createCryptoMock(
  hash = 'hashed-nonce-sha256',
  overrides: Partial<AppleCryptoClient> = {},
): AppleCryptoClient & {
  calls: Array<{ algorithm: unknown; data: string }>;
  randomCalls: number;
} {
  const calls: Array<{ algorithm: unknown; data: string }> = [];
  const state = { randomCalls: 0 };
  return {
    calls,
    get randomCalls() {
      return state.randomCalls;
    },
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    async digestStringAsync(algorithm, data) {
      calls.push({ algorithm, data });
      return hash;
    },
    async getRandomBytesAsync(byteCount) {
      state.randomCalls += 1;
      if (overrides.getRandomBytesAsync) {
        return overrides.getRandomBytesAsync(byteCount);
      }
      const bytes = new Uint8Array(byteCount);
      for (let i = 0; i < byteCount; i += 1) {
        bytes[i] = (i * 7 + state.randomCalls * 13) % 256;
      }
      return bytes;
    },
  };
}

function createAppleClient(
  overrides: Partial<{
    available: boolean;
    signIn: AppleAuthenticationClient['signInAsync'];
  }> = {},
): AppleAuthenticationClient & {
  lastSignInOptions: unknown;
  signInCalls: number;
} {
  const state = { lastSignInOptions: null as unknown, signInCalls: 0 };
  return {
    get lastSignInOptions() {
      return state.lastSignInOptions;
    },
    get signInCalls() {
      return state.signInCalls;
    },
    AppleAuthenticationScope: {
      FULL_NAME: 'FULL_NAME',
      EMAIL: 'EMAIL',
    },
    async isAvailableAsync() {
      return overrides.available ?? true;
    },
    async signInAsync(options) {
      state.signInCalls += 1;
      state.lastSignInOptions = options;
      if (overrides.signIn) {
        return overrides.signIn(options);
      }
      return {
        user: 'apple-user-1',
        identityToken: 'identity-token',
        email: 'user@privaterelay.appleid.com',
        fullName: {
          givenName: 'Ada',
          familyName: 'Lovelace',
        },
      };
    },
  };
}

function assertValidRawNonce(nonce: string): void {
  assert.equal(nonce.length, APPLE_RAW_NONCE_LENGTH);
  for (const char of nonce) {
    assert.ok(
      APPLE_RAW_NONCE_CHARSET.includes(char),
      `unexpected nonce char: ${char}`,
    );
  }
}

describe('createAppleProviderAdapter', () => {
  it('production source does not use Math.random or Date.now for nonces', () => {
    const source = readFileSync(adapterSourcePath, 'utf8');
    assert.equal(source.includes('Math.random('), false);
    assert.equal(source.includes('Date.now('), false);
    assert.match(source, /getRandomBytesAsync/);
  });

  it('requests FULL_NAME and EMAIL scopes', async () => {
    const appleAuth = createAppleClient();
    const crypto = createCryptoMock();
    const adapter = createAppleProviderAdapter({
      appleAuth,
      crypto,
      createRawNonce: () => 'raw-nonce-1',
      platformOS: 'ios',
    });

    await adapter.authenticate({ provider: 'apple', interactive: true });

    const options = appleAuth.lastSignInOptions as {
      requestedScopes: unknown[];
      nonce: string;
    };
    assert.deepEqual(options.requestedScopes, ['FULL_NAME', 'EMAIL']);
  });

  it('sends SHA-256 hashed nonce to Apple and keeps raw nonce for Firebase', async () => {
    const appleAuth = createAppleClient();
    const crypto = createCryptoMock('sha256-of-raw');
    const adapter = createAppleProviderAdapter({
      appleAuth,
      crypto,
      createRawNonce: () => 'raw-secret-nonce',
      platformOS: 'ios',
    });

    const result = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });

    assert.equal(crypto.calls.length, 1);
    assert.equal(crypto.calls[0]?.data, 'raw-secret-nonce');
    assert.equal(crypto.calls[0]?.algorithm, 'SHA256');
    assert.equal(
      (appleAuth.lastSignInOptions as { nonce: string }).nonce,
      'sha256-of-raw',
    );
    assert.equal(result.rawNonce, 'raw-secret-nonce');
    assert.equal(result.idToken, 'identity-token');
  });

  it('secure production path emits fixed-length charset nonces without Math.random', async () => {
    const appleAuth = createAppleClient();
    const crypto = createCryptoMock('hash-a');
    const adapter = createAppleProviderAdapter({
      appleAuth,
      crypto,
      // No createRawNonce — exercise getRandomBytesAsync path.
      platformOS: 'ios',
    });

    const result = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });

    assertValidRawNonce(result.rawNonce!);
    assert.ok(crypto.randomCalls >= 1);
    assert.equal(crypto.calls[0]?.data, result.rawNonce);
    assert.equal(
      (appleAuth.lastSignInOptions as { nonce: string }).nonce,
      'hash-a',
    );
  });

  it('two attempts generate independent secure nonces', async () => {
    let seed = 0;
    const crypto = createCryptoMock('hash', {
      async getRandomBytesAsync(byteCount) {
        seed += 1;
        const bytes = new Uint8Array(byteCount);
        for (let i = 0; i < byteCount; i += 1) {
          bytes[i] = (seed * 41 + i * 9) % 256;
        }
        return bytes;
      },
    });
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient(),
      crypto,
      platformOS: 'ios',
    });

    const first = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });
    const second = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });

    assertValidRawNonce(first.rawNonce!);
    assertValidRawNonce(second.rawNonce!);
    assert.notEqual(first.rawNonce, second.rawNonce);
  });

  it('stops the flow when secure nonce generation fails (no Apple sheet)', async () => {
    const appleAuth = createAppleClient();
    const crypto = createCryptoMock('unused', {
      async getRandomBytesAsync() {
        throw new Error('rng unavailable');
      },
    });
    const adapter = createAppleProviderAdapter({
      appleAuth,
      crypto,
      platformOS: 'ios',
    });

    await assert.rejects(
      () => adapter.authenticate({ provider: 'apple', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'CONFIGURATION_ERROR' &&
        err.social.diagnosticCode === 'APPLE_NONCE_GENERATION_FAILED',
    );
    assert.equal(appleAuth.signInCalls, 0);
  });

  it('still allows deterministic injected nonces for tests', async () => {
    const appleAuth = createAppleClient();
    const crypto = createCryptoMock('det-hash');
    const adapter = createAppleProviderAdapter({
      appleAuth,
      crypto,
      createRawNonce: async () => 'deterministic-nonce-value-32ch!!'.slice(0, 32),
      platformOS: 'ios',
    });

    const result = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });

    assert.equal(result.rawNonce, 'deterministic-nonce-value-32ch!!');
    assert.equal(crypto.randomCalls, 0);
    assert.equal(crypto.calls[0]?.data, result.rawNonce);
  });

  it('captures name and email when Apple delivers them', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient(),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'ios',
    });

    const result = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });

    assert.equal(result.email, 'user@privaterelay.appleid.com');
    assert.equal(result.givenName, 'Ada');
    assert.equal(result.familyName, 'Lovelace');
    assert.equal(result.displayName, 'Ada Lovelace');
    assert.equal(result.photoUrl, undefined);
  });

  it('allows missing name and email', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient({
        signIn: async () => ({
          user: 'apple-user-2',
          identityToken: 'token-2',
          email: null,
          fullName: null,
        }),
      }),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'ios',
    });

    const result = await adapter.authenticate({
      provider: 'apple',
      interactive: true,
    });

    assert.equal(result.email, undefined);
    assert.equal(result.displayName, undefined);
    assert.equal(result.givenName, undefined);
    assert.equal(result.familyName, undefined);
    assert.equal(result.idToken, 'token-2');
    assert.equal(result.rawNonce, 'nonce');
  });

  it('rejects missing identityToken', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient({
        signIn: async () => ({
          user: 'apple-user-3',
          identityToken: null,
        }),
      }),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'ios',
    });

    await assert.rejects(
      () => adapter.authenticate({ provider: 'apple', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'TOKEN_MISSING',
    );
  });

  it('normalizes user cancellation', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient({
        signIn: async () => {
          throw { code: 'ERR_REQUEST_CANCELED' };
        },
      }),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'ios',
    });

    await assert.rejects(
      () => adapter.authenticate({ provider: 'apple', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'CANCELLED',
    );
  });

  it('normalizes unavailability', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient({ available: false }),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'ios',
    });

    await assert.rejects(
      () => adapter.authenticate({ provider: 'apple', interactive: true }),
      (err: unknown) =>
        err instanceof SocialAuthError &&
        err.social.code === 'PROVIDER_UNAVAILABLE',
    );
  });

  it('normalizes unexpected provider errors without leaking payloads', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient({
        signIn: async () => {
          throw {
            code: 'ERR_APPLE_AUTH',
            message: 'token=super-secret-identity-token',
          };
        },
      }),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'ios',
    });

    await assert.rejects(
      () => adapter.authenticate({ provider: 'apple', interactive: true }),
      (err: unknown) => {
        if (!(err instanceof SocialAuthError)) return false;
        assert.equal(err.social.code, 'UNKNOWN');
        assert.equal(err.message.includes('super-secret'), false);
        return true;
      },
    );
  });

  it('reports unavailable when platform is not iOS', async () => {
    const adapter = createAppleProviderAdapter({
      appleAuth: createAppleClient(),
      crypto: createCryptoMock(),
      createRawNonce: () => 'nonce',
      platformOS: 'android',
    });

    assert.equal(await adapter.isAvailable(), false);
  });
});
