import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  deleteAccountWithBackend,
  isAuthTimeRecentForDeletion,
  type AccountDeletionRuntime,
} from '../accountDeletion';
import {
  __resetAccountDeletionSessionForTests,
  isAccountDeletionSessionActive,
} from '../accountDeletionSession';
import { resolveAccountDeletionErrorMessageKey } from '../accountDeletionErrorPresentation';
import {
  AccountDeletionReauthError,
  __resetAccountDeletionReauthInProgressForTests,
  reauthenticateForAccountDeletion,
  type ReauthenticateForDeletionDependencies,
} from '../deletionReauth';
import { DeleteMyAccountError } from '../deleteMyAccount/contract';
import { createSocialAuthError } from '../../authentication/social/domain/socialAuthenticationError';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const UID = 'uid-current';

type Recorder = { events: string[]; callableCalls: number };

function createRuntime(
  overrides: Partial<AccountDeletionRuntime> = {},
  recorder: Recorder = { events: [], callableCalls: 0 },
): { runtime: AccountDeletionRuntime; recorder: Recorder } {
  const runtime: AccountDeletionRuntime = {
    getCurrentUid: () => UID,
    getAuthTimeMs: async () => NOW - 30_000,
    nowMs: () => NOW,
    reauthenticate: async () => {
      recorder.events.push('reauth');
    },
    deleteMyAccount: async ({ expectedUid }) => {
      recorder.callableCalls += 1;
      recorder.events.push(`callable:${expectedUid}`);
      return { ok: true, status: 'DELETED' };
    },
    ...overrides,
  };
  return { runtime, recorder };
}

function socialDeps(
  overrides: Partial<ReauthenticateForDeletionDependencies> = {},
): ReauthenticateForDeletionDependencies {
  const user = { uid: UID } as any;
  return {
    getCurrentUser: () => user,
    reauthenticateWithCredential: async () => undefined,
    createGoogleCredential: (idToken) => ({ providerId: 'google.com', idToken }) as any,
    createAppleCredential: ({ idToken, rawNonce }) =>
      ({ providerId: 'apple.com', idToken, rawNonce }) as any,
    createFacebookCredential: (tokens) => ({ providerId: 'facebook.com', ...tokens }) as any,
    obtainGoogleProviderTokens: async () => ({ idToken: 'g', providerUserId: 'g-sub' }),
    obtainAppleProviderTokens: async () => ({
      identityToken: 'a',
      rawNonce: 'n',
      providerUserId: 'a-sub',
    }),
    obtainFacebookProviderTokens: async () => ({
      idToken: 'oidc',
      rawNonce: 'n',
      providerUserId: 'fb-sub',
    }),
    reauthWithPassword: async () => undefined,
    ...overrides,
  };
}

describe('deleteAccountWithBackend — backend is the only deletion authority', () => {
  beforeEach(() => {
    __resetAccountDeletionSessionForTests();
    __resetAccountDeletionReauthInProgressForTests();
  });

  it('recent session calls deleteMyAccount exactly once for the same UID', async () => {
    const { runtime, recorder } = createRuntime();
    const result = await deleteAccountWithBackend({}, runtime);
    assert.deepEqual(result, { status: 'deleted', uid: UID, backendStatus: 'DELETED' });
    assert.equal(recorder.callableCalls, 1);
    assert.deepEqual(recorder.events, [`callable:${UID}`]);
    assert.equal(isAccountDeletionSessionActive(), true, 'kept until finalize');
  });

  it('ALREADY_DELETED (user not found after a lost response) is a confirmed success', async () => {
    const { runtime } = createRuntime({
      deleteMyAccount: async () => ({ ok: true, status: 'ALREADY_DELETED' }),
    });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status, 'deleted');
    assert.equal(result.status === 'deleted' && result.backendStatus, 'ALREADY_DELETED');
  });

  it('stale or unknown auth_time asks for reauthentication before any callable', async () => {
    for (const authTime of [NOW - 241_000, null, NOW + 120_000]) {
      const { runtime, recorder } = createRuntime({ getAuthTimeMs: async () => authTime });
      const result = await deleteAccountWithBackend({}, runtime);
      assert.deepEqual(result, { status: 'reauth_required' });
      assert.equal(recorder.callableCalls, 0);
    }
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('client freshness budget stays under the 300 s backend limit', () => {
    assert.equal(isAuthTimeRecentForDeletion(NOW - 240_000, NOW), true);
    assert.equal(isAuthTimeRecentForDeletion(NOW - 241_000, NOW), false);
    assert.equal(isAuthTimeRecentForDeletion(NOW + 60_000, NOW), true);
    assert.equal(isAuthTimeRecentForDeletion(NOW + 61_000, NOW), false);
    assert.equal(isAuthTimeRecentForDeletion(null, NOW), false);
  });

  for (const [label, method, deps] of [
    ['password', { kind: 'password' as const }, {}],
    ['Google', { kind: 'google' as const, linkedProviderUserId: 'g-sub' }, {}],
    ['Apple', { kind: 'apple' as const, linkedProviderUserId: 'a-sub' }, {}],
    ['Facebook Limited Login', { kind: 'facebook' as const, linkedProviderUserId: 'fb-sub' }, {}],
  ] as const) {
    it(`${label}: reauthenticates the same user, then calls deleteMyAccount once`, async () => {
      const events: string[] = [];
      const { runtime, recorder } = createRuntime({
        getAuthTimeMs: async () => {
          throw new Error('recency is not consulted after an explicit reauth');
        },
        reauthenticate: (input) =>
          reauthenticateForAccountDeletion(
            input,
            socialDeps({
              ...deps,
              reauthWithPassword: async () => {
                events.push('password');
              },
              reauthenticateWithCredential: async (user, credential: any) => {
                assert.equal(user.uid, UID);
                events.push(`credential:${credential.providerId}`);
              },
            }),
          ),
      });
      const result = await deleteAccountWithBackend(
        { reauth: { method, password: 'secret' } },
        runtime,
      );
      assert.equal(result.status, 'deleted');
      assert.equal(recorder.callableCalls, 1);
      assert.equal(events.length, 1, 'exactly one reauthentication before the callable');
    });
  }

  it('LinkedIn: recent custom-token session deletes without another browser flow', async () => {
    const { runtime, recorder } = createRuntime({ getCurrentUid: () => 'li_abc' });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status, 'deleted');
    assert.deepEqual(recorder.events, ['callable:li_abc']);
  });

  it('LinkedIn: fresh session for the same deterministic UID, then the callable', async () => {
    const recorder: Recorder = { events: [], callableCalls: 0 };
    const { runtime } = createRuntime(
      {
        getCurrentUid: () => 'li_abc',
        reauthenticate: (input) =>
          reauthenticateForAccountDeletion(
            input,
            socialDeps({
              getCurrentUser: () => ({ uid: 'li_abc' }) as any,
              refreshLinkedInSession: async (expectedUid) => {
                recorder.events.push(`linkedin:${expectedUid}`);
              },
            }),
          ),
      },
      recorder,
    );
    const result = await deleteAccountWithBackend({ reauth: { method: { kind: 'linkedin' } } }, runtime);
    assert.equal(result.status, 'deleted');
    assert.deepEqual(recorder.events, ['linkedin:li_abc', 'callable:li_abc']);
  });

  it('LinkedIn without a safe fresh session explains how to sign in again; nothing is called', async () => {
    const { runtime, recorder } = createRuntime({
      getCurrentUid: () => 'li_abc',
      reauthenticate: (input) =>
        reauthenticateForAccountDeletion(
          input,
          socialDeps({ getCurrentUser: () => ({ uid: 'li_abc' }) as any }),
        ),
    });
    const result = await deleteAccountWithBackend({ reauth: { method: { kind: 'linkedin' } } }, runtime);
    assert.equal(result.status, 'failed');
    assert.equal(
      result.status === 'failed' && result.messageKey,
      'settings.deleteAccount.linkedInSignInAgain',
    );
    assert.equal(recorder.callableCalls, 0);
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('a UID change after reauthentication aborts before the callable', async () => {
    let uid = UID;
    const { runtime, recorder } = createRuntime({
      getCurrentUid: () => uid,
      reauthenticate: async () => {
        uid = 'uid-other';
      },
    });
    const result = await deleteAccountWithBackend(
      { reauth: { method: { kind: 'google', linkedProviderUserId: 'g-sub' } } },
      runtime,
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.status === 'failed' && result.failure, 'IDENTITY_CHANGED');
    assert.equal(recorder.callableCalls, 0);
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('reauth for a different account than the confirmed one never reaches the callable', async () => {
    const { runtime, recorder } = createRuntime({
      reauthenticate: (input) =>
        reauthenticateForAccountDeletion(
          input,
          socialDeps({ getCurrentUser: () => ({ uid: 'uid-other' }) as any }),
        ),
    });
    const result = await deleteAccountWithBackend(
      { reauth: { method: { kind: 'google', linkedProviderUserId: 'g-sub' } } },
      runtime,
    );
    assert.equal(result.status === 'failed' && result.failure, 'IDENTITY_MISMATCH');
    assert.equal(recorder.callableCalls, 0);
  });

  it('cancellation deletes nothing, shows no error and allows a retry', async () => {
    const { runtime, recorder } = createRuntime({
      reauthenticate: (input) =>
        reauthenticateForAccountDeletion(
          input,
          socialDeps({
            obtainAppleProviderTokens: async () => {
              throw createSocialAuthError({
                code: 'CANCELLED',
                provider: 'apple',
                recoverable: true,
                messageKey: 'authentication.social.errors.cancelled',
              });
            },
          }),
        ),
    });
    const request = { reauth: { method: { kind: 'apple' as const, linkedProviderUserId: 'a-sub' } } };
    assert.deepEqual(await deleteAccountWithBackend(request, runtime), { status: 'cancelled' });
    assert.equal(recorder.callableCalls, 0);
    assert.equal(isAccountDeletionSessionActive(), false);

    runtime.reauthenticate = async () => undefined;
    assert.equal((await deleteAccountWithBackend(request, runtime)).status, 'deleted');
    assert.equal(recorder.callableCalls, 1);
  });

  it('double tap: a second request while one is in flight is ignored', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runtime, recorder } = createRuntime({
      deleteMyAccount: async () => {
        recorder.callableCalls += 1;
        await gate;
        return { ok: true, status: 'DELETED' };
      },
    });
    const first = deleteAccountWithBackend({}, runtime);
    const second = await deleteAccountWithBackend({}, runtime);
    assert.deepEqual(second, { status: 'busy' });
    release();
    assert.equal((await first).status, 'deleted');
    assert.equal(recorder.callableCalls, 1);
  });

  it('RECENT_LOGIN_REQUIRED from the backend reopens reauth; nothing was deleted', async () => {
    const { runtime } = createRuntime({
      deleteMyAccount: async () => {
        throw new DeleteMyAccountError('RECENT_LOGIN_REQUIRED', false);
      },
    });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.reauthRequired, true);
    assert.equal(result.serverMayHaveDeleted, false);
    assert.equal(result.messageKey, 'settings.deleteAccount.sessionNotRecent');
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('App Check rejection maps to its own message and ends the deletion session', async () => {
    const { runtime } = createRuntime({
      deleteMyAccount: async () => {
        throw new DeleteMyAccountError('APP_CHECK', false);
      },
    });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status === 'failed' && result.messageKey, 'settings.deleteAccount.appCheckFailed');
    assert.equal(isAccountDeletionSessionActive(), false);
  });

  it('ambiguous network failure never claims completion and keeps the profile gate suppressed', async () => {
    const { runtime, recorder } = createRuntime({
      deleteMyAccount: async () => {
        recorder.callableCalls += 1;
        throw new DeleteMyAccountError('NETWORK_UNCERTAIN', true);
      },
    });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.serverMayHaveDeleted, true);
    assert.equal(result.messageKey, 'settings.deleteAccount.networkUncertain');
    assert.equal(recorder.callableCalls, 1, 'no automatic retry');
    assert.equal(
      isAccountDeletionSessionActive(),
      true,
      'users/{uid} may be gone: AppNavigator must not route to CompleteProfile',
    );
  });

  it('retryable backend failure allows a manual retry that can succeed', async () => {
    let attempt = 0;
    const { runtime } = createRuntime({
      deleteMyAccount: async () => {
        attempt += 1;
        if (attempt === 1) throw new DeleteMyAccountError('DELETION_RETRYABLE', true);
        return { ok: true, status: 'DELETED' };
      },
    });
    const first = await deleteAccountWithBackend({}, runtime);
    assert.equal(first.status === 'failed' && first.messageKey, 'settings.deleteAccount.retryable');
    const second = await deleteAccountWithBackend({}, runtime);
    assert.equal(second.status, 'deleted');
    assert.equal(attempt, 2);
  });

  it('unexpected callable throwables are treated as uncertain, never as success', async () => {
    const { runtime } = createRuntime({
      deleteMyAccount: async () => {
        throw new Error('boom');
      },
    });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status === 'failed' && result.failure, 'UNKNOWN');
    assert.equal(result.status === 'failed' && result.serverMayHaveDeleted, true);
  });

  it('signed-out user cannot start deletion', async () => {
    const { runtime, recorder } = createRuntime({ getCurrentUid: () => null });
    const result = await deleteAccountWithBackend({}, runtime);
    assert.equal(result.status === 'failed' && result.messageKey, 'settings.deleteAccount.signedOut');
    assert.equal(recorder.callableCalls, 0);
  });
});

describe('resolveAccountDeletionErrorMessageKey', () => {
  it('maps callable kinds and reauth errors; raw Firebase errors fall back to a generic key', () => {
    assert.equal(
      resolveAccountDeletionErrorMessageKey(new DeleteMyAccountError('DELETION_FAILED', true)),
      'settings.deleteAccount.failed',
    );
    assert.equal(
      resolveAccountDeletionErrorMessageKey(
        new AccountDeletionReauthError('WRONG_PASSWORD', 'settings.deleteAccount.reauthError'),
      ),
      'settings.deleteAccount.reauthError',
    );
    assert.equal(
      resolveAccountDeletionErrorMessageKey({
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      }),
      'settings.deleteAccount.error',
    );
  });
});
