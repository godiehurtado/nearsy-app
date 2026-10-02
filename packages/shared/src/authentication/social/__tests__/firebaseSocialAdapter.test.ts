import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  createFirebaseJsAuthenticationAdapter,
  mapFirebaseSocialError,
} from '../infrastructure/firebase/firebaseJsAuthenticationAdapter.ios';
import {
  SocialAuthError,
  sanitizeSocialErrorForLog,
} from '../domain/socialAuthenticationError';
import type { UserCredential } from 'firebase/auth';

const here = dirname(fileURLToPath(import.meta.url));

function fakeUserCredential(
  overrides: {
    uid?: string;
    email?: string | null;
    providerIds?: string[];
  } = {},
): UserCredential {
  return {
    user: {
      uid: overrides.uid ?? 'uid-1',
      email: overrides.email === undefined ? 'user@example.com' : overrides.email,
      providerData: (overrides.providerIds ?? ['google.com']).map((providerId) => ({
        providerId,
      })),
    },
  } as unknown as UserCredential;
}

/** Shape produced by Firebase JS 1.7.x (`UserCredentialImpl`): no `additionalUserInfo`. */
function modularUserCredential(tokenResponse: Record<string, unknown> | undefined): UserCredential {
  return {
    user: {
      uid: 'fb-uid',
      email: null,
      isAnonymous: false,
      providerData: [{ providerId: 'facebook.com' }],
    },
    providerId: 'facebook.com',
    operationType: 'signIn',
    _tokenResponse: tokenResponse,
  } as unknown as UserCredential;
}

function facebookOidcAdapter(signIn: () => Promise<UserCredential>) {
  return createFirebaseJsAuthenticationAdapter({
    OAuthProvider: class {
      constructor(private readonly id: string) {}
      credential(params: { idToken?: string; rawNonce?: string }) {
        return { providerId: this.id, idToken: params.idToken, nonce: params.rawNonce };
      }
    } as never,
    signInWithCredential: signIn,
    auth: { name: 'firebase-auth' },
  });
}

describe('isNewUser via modular getAdditionalUserInfo()', () => {
  const input = { provider: 'facebook' as const, idToken: 'oidc-token', rawNonce: 'raw-nonce' };

  it('reports a new user from the Identity Toolkit response (isNewUser: true)', async () => {
    const adapter = facebookOidcAdapter(async () =>
      modularUserCredential({ providerId: 'facebook.com', isNewUser: true, rawUserInfo: '{}' }),
    );
    const session = await adapter.signInWithSocialCredential(input);
    assert.equal(session.isNewUser, true);
  });

  it('reports a new user from a SignupNewUser response kind', async () => {
    const adapter = facebookOidcAdapter(async () =>
      modularUserCredential({
        providerId: 'facebook.com',
        kind: 'identitytoolkit#SignupNewUserResponse',
      }),
    );
    assert.equal((await adapter.signInWithSocialCredential(input)).isNewUser, true);
  });

  it('reports a returning user as not new', async () => {
    const adapter = facebookOidcAdapter(async () =>
      modularUserCredential({ providerId: 'facebook.com', isNewUser: false }),
    );
    assert.equal((await adapter.signInWithSocialCredential(input)).isNewUser, false);
  });

  it('ignores a legacy namespaced additionalUserInfo property', async () => {
    const adapter = facebookOidcAdapter(async () =>
      ({
        ...modularUserCredential({ providerId: 'facebook.com', isNewUser: false }),
        additionalUserInfo: { isNewUser: true },
      }) as unknown as UserCredential,
    );
    assert.equal((await adapter.signInWithSocialCredential(input)).isNewUser, false);
  });

  it('falls back to false when no token response is available', async () => {
    const adapter = facebookOidcAdapter(async () => modularUserCredential(undefined));
    assert.equal((await adapter.signInWithSocialCredential(input)).isNewUser, false);
  });

  it('uses an injected reader and survives a throwing reader', async () => {
    const injected = createFirebaseJsAuthenticationAdapter({
      async signInWithCredential() {
        return fakeUserCredential({ providerIds: ['google.com'] });
      },
      getAdditionalUserInfo: () => ({ isNewUser: true, providerId: 'google.com', profile: null }),
      auth: {},
    });
    assert.equal(
      (await injected.signInWithSocialCredential({ provider: 'google', idToken: 't' })).isNewUser,
      true,
    );

    const throwing = createFirebaseJsAuthenticationAdapter({
      async signInWithCredential() {
        return fakeUserCredential({ providerIds: ['google.com'] });
      },
      getAdditionalUserInfo: () => {
        throw new Error('boom');
      },
      auth: {},
    });
    assert.equal(
      (await throwing.signInWithSocialCredential({ provider: 'google', idToken: 't' })).isNewUser,
      false,
    );
  });

  it('adapter source never reads cred.additionalUserInfo', () => {
    const source = readFileSync(
      join(here, '..', 'infrastructure', 'firebase', 'firebaseJsAuthenticationAdapter.ios.ts'),
      'utf8',
    );
    assert.doesNotMatch(source, /\.additionalUserInfo/);
    assert.match(source, /getAdditionalUserInfo/);
  });
});

describe('createFirebaseJsAuthenticationAdapter (Google + Apple)', () => {
  it('preserves Google credential exchange behavior', async () => {
    const calls: Array<{ kind: string; payload: unknown }> = [];
    const adapter = createFirebaseJsAuthenticationAdapter({
      GoogleAuthProvider: {
        credential(idToken, accessToken) {
          calls.push({
            kind: 'google-credential',
            payload: { idToken, accessToken },
          });
          return { type: 'google-cred' };
        },
      },
      async signInWithCredential(auth, credential) {
        calls.push({ kind: 'signIn', payload: { auth, credential } });
        return fakeUserCredential({
          uid: 'g-uid',
          providerIds: ['google.com'],
        });
      },
      auth: { name: 'firebase-auth' },
    });

    const session = await adapter.signInWithSocialCredential({
      provider: 'google',
      idToken: 'google-id-token',
      accessToken: 'google-access',
    });

    assert.equal(session.uid, 'g-uid');
    assert.deepEqual(calls[0]?.payload, {
      idToken: 'google-id-token',
      accessToken: 'google-access',
    });
    assert.equal(
      (calls[1]?.payload as { credential: { type: string } }).credential.type,
      'google-cred',
    );
  });

  it('builds Apple OAuthProvider(apple.com) with identityToken and rawNonce', async () => {
    const calls: Array<{ kind: string; payload: unknown }> = [];

    class MockOAuthProvider {
      constructor(public providerId: string) {
        calls.push({ kind: 'oauth-ctor', payload: providerId });
      }
      credential(params: { idToken?: string; rawNonce?: string }) {
        calls.push({ kind: 'oauth-credential', payload: params });
        return { type: 'apple-cred', params };
      }
    }

    const adapter = createFirebaseJsAuthenticationAdapter({
      OAuthProvider: MockOAuthProvider as any,
      async signInWithCredential(_auth, credential) {
        calls.push({ kind: 'signIn', payload: credential });
        return fakeUserCredential({
          uid: 'apple-uid',
          email: 'relay@privaterelay.appleid.com',
          providerIds: ['apple.com'],
        });
      },
      auth: { name: 'firebase-auth' },
    });

    const session = await adapter.signInWithSocialCredential({
      provider: 'apple',
      identityToken: 'apple-identity-token',
      rawNonce: 'apple-raw-nonce',
    });

    assert.equal(session.uid, 'apple-uid');
    assert.equal(calls[0]?.payload, 'apple.com');
    assert.deepEqual(calls[1]?.payload, {
      idToken: 'apple-identity-token',
      rawNonce: 'apple-raw-nonce',
    });
  });

  it('rejects Apple input without identityToken', async () => {
    const adapter = createFirebaseJsAuthenticationAdapter({
      async signInWithCredential() {
        throw new Error('should not sign in');
      },
    });

    await assert.rejects(
      () =>
        adapter.signInWithSocialCredential({
          provider: 'apple',
          identityToken: '   ',
          rawNonce: 'nonce',
        }),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'TOKEN_MISSING',
    );
  });

  it('rejects Apple input without rawNonce', async () => {
    const adapter = createFirebaseJsAuthenticationAdapter({
      async signInWithCredential() {
        throw new Error('should not sign in');
      },
    });

    await assert.rejects(
      () =>
        adapter.signInWithSocialCredential({
          provider: 'apple',
          identityToken: 'token',
          rawNonce: '',
        }),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'TOKEN_INVALID',
    );
  });

  it('normalizes Firebase errors without leaking secrets', () => {
    try {
      mapFirebaseSocialError('apple', {
        code: 'auth/account-exists-with-different-credential',
        message: 'token=super-secret-jwt email=user@example.com',
      });
      assert.fail('expected throw');
    } catch (err) {
      assert.ok(err instanceof SocialAuthError);
      assert.equal(err.social.code, 'ACCOUNT_CONFLICT');
      const sanitized = sanitizeSocialErrorForLog(err.social);
      assert.equal(sanitized.code, 'ACCOUNT_CONFLICT');
      assert.equal(
        JSON.stringify(sanitized).includes('super-secret-jwt'),
        false,
      );
      assert.equal(JSON.stringify(sanitized).includes('user@example.com'), false);
    }
  });

  it('maps invalid credential Firebase codes to TOKEN_INVALID', () => {
    assert.throws(
      () =>
        mapFirebaseSocialError('apple', {
          code: 'auth/invalid-credential',
        }),
      (err: unknown) =>
        err instanceof SocialAuthError && err.social.code === 'TOKEN_INVALID',
    );
  });

  it('maps auth/missing-or-invalid-nonce to TOKEN_INVALID without leaking secrets', () => {
    try {
      mapFirebaseSocialError('apple', {
        code: 'auth/missing-or-invalid-nonce',
        message: 'nonce=super-secret-raw-nonce',
      });
      assert.fail('expected throw');
    } catch (err) {
      assert.ok(err instanceof SocialAuthError);
      assert.equal(err.social.code, 'TOKEN_INVALID');
      assert.equal(err.social.diagnosticCode, 'auth/missing-or-invalid-nonce');
      const sanitized = sanitizeSocialErrorForLog(err.social);
      assert.equal(
        JSON.stringify(sanitized).includes('super-secret-raw-nonce'),
        false,
      );
    }
  });
});
