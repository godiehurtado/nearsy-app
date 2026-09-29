import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  MVP_FREE_SHOW_INTEREST_SEARCH_FILTER,
  MVP_FREE_SHOW_PROFILE_CONNECT_CTA,
} from '../../../product/mvpFreePresentation';
import {
  AccountDeletionReauthError,
  __resetAccountDeletionReauthInProgressForTests,
  reauthenticateForAccountDeletion,
  resolveDeletionReauthMethod,
  type ReauthenticateForDeletionDependencies,
} from '../index';
import { createSocialAuthError } from '../../../authentication/social/domain/socialAuthenticationError';

describe('resolveDeletionReauthMethod', () => {
  it('password-only → password reauth', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'password', uid: 'email-uid', email: 'a@b.com' },
    ]);
    assert.deepEqual(method, { kind: 'password' });
  });

  it('google-only → google reauth (no password)', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'google.com', uid: 'google-sub-1', email: 'g@x.com' },
    ]);
    assert.deepEqual(method, {
      kind: 'google',
      linkedProviderUserId: 'google-sub-1',
    });
  });

  it('apple-only → apple reauth (no password)', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'apple.com', uid: 'apple-sub-1' },
    ]);
    assert.deepEqual(method, {
      kind: 'apple',
      linkedProviderUserId: 'apple-sub-1',
    });
  });

  it('multi-provider password+google → deterministic password', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'google.com', uid: 'g1' },
      { providerId: 'password', uid: 'p1', email: 'a@b.com' },
    ]);
    assert.equal(method.kind, 'password');
  });

  it('multi-provider google+apple → deterministic google', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'apple.com', uid: 'a1' },
      { providerId: 'google.com', uid: 'g1' },
    ]);
    assert.deepEqual(method, {
      kind: 'google',
      linkedProviderUserId: 'g1',
    });
  });

  it('facebook-only → facebook reauth (no password)', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'facebook.com', uid: 'fb-app-scoped-1' },
    ]);
    assert.deepEqual(method, {
      kind: 'facebook',
      linkedProviderUserId: 'fb-app-scoped-1',
    });
  });

  it('multi-provider apple+facebook → deterministic apple; others keep priority', () => {
    assert.equal(
      resolveDeletionReauthMethod([
        { providerId: 'facebook.com', uid: 'fb1' },
        { providerId: 'apple.com', uid: 'a1' },
      ]).kind,
      'apple',
    );
    assert.equal(
      resolveDeletionReauthMethod([
        { providerId: 'facebook.com', uid: 'fb1' },
        { providerId: 'password', uid: 'p1' },
      ]).kind,
      'password',
    );
  });

  it('empty providerData (custom-token / LinkedIn A3) → unavailable, not password', () => {
    const method = resolveDeletionReauthMethod([]);
    assert.deepEqual(method, {
      kind: 'unavailable',
      reason: 'custom_token_only',
    });
  });

  it('unsupported-only provider → unavailable, not password', () => {
    const method = resolveDeletionReauthMethod([
      { providerId: 'twitter.com', uid: 'tw1' },
    ]);
    assert.deepEqual(method, {
      kind: 'unavailable',
      reason: 'no_supported_provider',
    });
  });
});

function createMockDeps(
  overrides: Partial<ReauthenticateForDeletionDependencies> = {},
): ReauthenticateForDeletionDependencies {
  const user = {
    uid: 'uid-current',
    email: 'user@nearsy.test',
    providerData: [{ providerId: 'google.com', uid: 'google-sub-1' }],
  } as any;

  return {
    getCurrentUser: () => user,
    reauthenticateWithCredential: async () => undefined,
    createGoogleCredential: (idToken) => ({ providerId: 'google.com', idToken }) as any,
    createAppleCredential: ({ idToken, rawNonce }) =>
      ({ providerId: 'apple.com', idToken, rawNonce }) as any,
    obtainGoogleProviderTokens: async () => ({
      idToken: 'google-id-token',
      accessToken: 'google-access',
      providerUserId: 'google-sub-1',
    }),
    obtainAppleProviderTokens: async () => ({
      identityToken: 'apple-id-token',
      rawNonce: 'raw-nonce',
      providerUserId: 'apple-sub-1',
    }),
    createFacebookCredential: (tokens) =>
      ({ providerId: 'facebook.com', ...tokens }) as any,
    obtainFacebookProviderTokens: async () => ({
      accessToken: 'fb-access-token',
      providerUserId: 'fb-app-scoped-1',
    }),
    reauthWithPassword: async () => undefined,
    ...overrides,
  };
}

describe('reauthenticateForAccountDeletion', () => {
  beforeEach(() => {
    __resetAccountDeletionReauthInProgressForTests();
  });

  it('password path uses password reauth and can continue', async () => {
    let passwordCalls = 0;
    let credentialCalls = 0;
    await reauthenticateForAccountDeletion(
      { method: { kind: 'password' }, password: 'secret' },
      createMockDeps({
        reauthWithPassword: async (password) => {
          passwordCalls += 1;
          assert.equal(password, 'secret');
        },
        reauthenticateWithCredential: async () => {
          credentialCalls += 1;
        },
      }),
    );
    assert.equal(passwordCalls, 1);
    assert.equal(credentialCalls, 0);
  });

  it('google path reauthenticates current user (not sign-in replacement)', async () => {
    let seenUserUid: string | undefined;
    let seenCred: unknown;
    await reauthenticateForAccountDeletion(
      {
        method: { kind: 'google', linkedProviderUserId: 'google-sub-1' },
      },
      createMockDeps({
        reauthenticateWithCredential: async (user, credential) => {
          seenUserUid = user.uid;
          seenCred = credential;
        },
      }),
    );
    assert.equal(seenUserUid, 'uid-current');
    assert.equal((seenCred as any).providerId, 'google.com');
  });

  it('apple path reauthenticates current user', async () => {
    let seenCred: unknown;
    await reauthenticateForAccountDeletion(
      {
        method: { kind: 'apple', linkedProviderUserId: 'apple-sub-1' },
      },
      createMockDeps({
        getCurrentUser: () =>
          ({
            uid: 'uid-current',
            providerData: [{ providerId: 'apple.com', uid: 'apple-sub-1' }],
          }) as any,
        reauthenticateWithCredential: async (_user, credential) => {
          seenCred = credential;
        },
      }),
    );
    assert.equal((seenCred as any).providerId, 'apple.com');
  });

  it('facebook path reauthenticates current user with a fresh Facebook credential', async () => {
    let seenCred: any;
    let seenUserUid: string | undefined;
    await reauthenticateForAccountDeletion(
      { method: { kind: 'facebook', linkedProviderUserId: 'fb-app-scoped-1' } },
      createMockDeps({
        reauthenticateWithCredential: async (user, credential) => {
          seenUserUid = user.uid;
          seenCred = credential;
        },
      }),
    );
    assert.equal(seenUserUid, 'uid-current');
    assert.equal(seenCred.providerId, 'facebook.com');
    assert.equal(seenCred.accessToken, 'fb-access-token');
  });

  it('facebook Limited Login reauth passes idToken + rawNonce', async () => {
    let seenCred: any;
    await reauthenticateForAccountDeletion(
      { method: { kind: 'facebook', linkedProviderUserId: 'fb-app-scoped-1' } },
      createMockDeps({
        obtainFacebookProviderTokens: async () => ({
          idToken: 'oidc-jwt',
          rawNonce: 'raw-nonce',
          providerUserId: '',
        }),
        reauthenticateWithCredential: async (_user, credential) => {
          seenCred = credential;
        },
      }),
    );
    assert.equal(seenCred.idToken, 'oidc-jwt');
    assert.equal(seenCred.rawNonce, 'raw-nonce');
  });

  it('facebook reauth cancel never reaches credential reauth (account not deleted)', async () => {
    let credentialCalls = 0;
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'facebook', linkedProviderUserId: 'fb-app-scoped-1' } },
          createMockDeps({
            obtainFacebookProviderTokens: async () => {
              throw createSocialAuthError({
                code: 'CANCELLED',
                provider: 'facebook',
                recoverable: true,
                messageKey: 'authentication.social.errors.cancelled',
              });
            },
            reauthenticateWithCredential: async () => {
              credentialCalls += 1;
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError &&
        err.code === 'CANCELLED' &&
        err.messageKey === 'settings.deleteAccount.reauthCancelled',
    );
    assert.equal(credentialCalls, 0);
  });

  it('facebook identity mismatch aborts before credential reauth', async () => {
    let credentialCalls = 0;
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'facebook', linkedProviderUserId: 'fb-app-scoped-1' } },
          createMockDeps({
            obtainFacebookProviderTokens: async () => ({
              accessToken: 'tok',
              providerUserId: 'another-facebook-user',
            }),
            reauthenticateWithCredential: async () => {
              credentialCalls += 1;
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError && err.code === 'IDENTITY_MISMATCH',
    );
    assert.equal(credentialCalls, 0);
  });

  it('Delete Account only deletes after a successful reauth', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const screen = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'screens', 'DeleteAccountScreen.tsx'),
      'utf8',
    );
    const handler = screen.slice(
      screen.indexOf('const handleReauthAndDelete'),
      screen.indexOf('const renderReauthActions'),
    );
    const reauthIdx = handler.indexOf('await reauthenticateForAccountDeletion');
    const deleteIdx = handler.indexOf('await deleteAccountAndData()');
    assert.ok(reauthIdx > 0 && deleteIdx > reauthIdx);
    assert.match(screen, /settings\.deleteAccount\.reauthContinueFacebook/);
    assert.match(screen, /settings\.deleteAccount\.reauthBodyFacebook/);
  });

  it('social cancellation does not complete reauth', async () => {
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
          createMockDeps({
            obtainGoogleProviderTokens: async () => {
              throw createSocialAuthError({
                code: 'CANCELLED',
                provider: 'google',
                recoverable: true,
                messageKey: 'auth.social.cancelled',
              });
            },
            reauthenticateWithCredential: async () => {
              throw new Error('should not reauth');
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError && err.code === 'CANCELLED',
    );
  });

  it('identity mismatch aborts before credential reauth', async () => {
    let credentialCalls = 0;
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
          createMockDeps({
            obtainGoogleProviderTokens: async () => ({
              idToken: 'tok',
              providerUserId: 'different-google-user',
            }),
            reauthenticateWithCredential: async () => {
              credentialCalls += 1;
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError &&
        err.code === 'IDENTITY_MISMATCH',
    );
    assert.equal(credentialCalls, 0);
  });

  it('firebase user-mismatch aborts deletion reauth', async () => {
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
          createMockDeps({
            reauthenticateWithCredential: async () => {
              const err = new Error('mismatch') as Error & { code: string };
              err.code = 'auth/user-mismatch';
              throw err;
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError &&
        err.code === 'IDENTITY_MISMATCH',
    );
  });

  it('reauthentication failure does not succeed', async () => {
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
          createMockDeps({
            reauthenticateWithCredential: async () => {
              const err = new Error('network') as Error & { code: string };
              err.code = 'auth/network-request-failed';
              throw err;
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError && err.code === 'NETWORK',
    );
  });

  it('unavailable method never asks for password path', async () => {
    let passwordCalls = 0;
    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          {
            method: { kind: 'unavailable', reason: 'custom_token_only' },
            password: 'should-not-use',
          },
          createMockDeps({
            reauthWithPassword: async () => {
              passwordCalls += 1;
            },
          }),
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError && err.code === 'UNAVAILABLE',
    );
    assert.equal(passwordCalls, 0);
  });

  it('double-submit guard blocks concurrent reauth', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const deps = createMockDeps({
      obtainGoogleProviderTokens: async () => {
        await gate;
        return {
          idToken: 'tok',
          providerUserId: 'google-sub-1',
        };
      },
    });

    const first = reauthenticateForAccountDeletion(
      { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
      deps,
    );

    await assert.rejects(
      () =>
        reauthenticateForAccountDeletion(
          { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
          deps,
        ),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError && err.code === 'IN_PROGRESS',
    );

    release();
    await first;
  });

  it('successful google reauth keeps same uid for deletion retry', async () => {
    const user = { uid: 'uid-stable' } as any;
    await reauthenticateForAccountDeletion(
      { method: { kind: 'google', linkedProviderUserId: 'google-sub-1' } },
      createMockDeps({
        getCurrentUser: () => user,
        obtainGoogleProviderTokens: async () => ({
          idToken: 'tok',
          providerUserId: 'google-sub-1',
        }),
      }),
    );
    assert.equal(user.uid, 'uid-stable');
  });
});

describe('Unit 1 presentation flags unchanged', () => {
  it('keeps Free MVP Connect CTA and Interest filter hidden', () => {
    assert.equal(MVP_FREE_SHOW_PROFILE_CONNECT_CTA, false);
    assert.equal(MVP_FREE_SHOW_INTEREST_SEARCH_FILTER, false);
  });
});
