/**
 * Behavior tests for Android Delete Account via `deleteMyAccount`.
 * Injected deps only: no RNFirebase, provider SDKs or React Native.
 * Run: node --experimental-strip-types --test packages/shared/src/accountDeletion/__tests__/deleteAccountCore.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DELETE_MY_ACCOUNT_CALLABLE,
  DeleteAccountReauthError,
  createDeleteAccountFlow,
  deleteAccountMessageKey,
  mapDeleteMyAccountFailure,
  readConfirmedDeletion,
  readCustomTokenUid,
  reauthenticateWithLinkedInSameUid,
  resolveDeleteAccountMethods,
  resolveDeleteAccountOptions,
  runAccountDeletionCleanup,
  type DeleteAccountDevLog,
  type DeleteAccountFlowDeps,
  type DeleteAccountMethod,
  type DeleteAccountUserSnapshot,
} from '../deleteAccountCore.ts';

const PASSWORD_UID = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1w';
const LINKEDIN_UID = 'li_Q2hhbmdlTWVQbGVhc2VMaW5rZWRJbg';
const SECRET_PASSWORD = 'hunter2-secret';

function user(uid: string, ...providerIds: string[]): DeleteAccountUserSnapshot {
  return { uid, providerIds };
}

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function customToken(payload: Record<string, unknown>): string {
  return [
    base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64Url(JSON.stringify(payload)),
    'signature',
  ].join('.');
}

type Harness = {
  deps: DeleteAccountFlowDeps;
  calls: string[];
  payloads: unknown[];
  logs: DeleteAccountDevLog[];
  setUser: (next: DeleteAccountUserSnapshot) => void;
};

function harness(
  initialUser: DeleteAccountUserSnapshot,
  overrides: Partial<DeleteAccountFlowDeps> = {},
): Harness {
  let current = initialUser;
  const calls: string[] = [];
  const payloads: unknown[] = [];
  const logs: DeleteAccountDevLog[] = [];
  const reauth = (method: DeleteAccountMethod) => async () => {
    calls.push(`reauth:${method}`);
  };
  const deps: DeleteAccountFlowDeps = {
    getCurrentUser: () => current,
    reauthenticate: {
      password: reauth('password'),
      google: reauth('google'),
      facebook: reauth('facebook'),
      linkedin: reauth('linkedin'),
    },
    invokeCallable: async (name, payload) => {
      calls.push(`callable:${name}`);
      payloads.push(payload);
      return { ok: true, status: 'DELETED' };
    },
    cleanupAfterDeletion: async (uid) => {
      calls.push(`cleanup:${uid === (initialUser?.uid ?? '') ? 'same-uid' : 'other'}`);
    },
    logDev: (entry) => {
      logs.push(entry);
    },
    ...overrides,
  };
  return {
    deps,
    calls,
    payloads,
    logs,
    setUser: (next) => {
      current = next;
    },
  };
}

function rejectWith(code: string, details?: Record<string, unknown>) {
  return async () => {
    throw Object.assign(new Error('backend said something internal'), {
      code,
      ...(details ? { details } : {}),
    });
  };
}

describe('Reauthentication methods (linked providers only)', () => {
  it('orders password, Google, Facebook, LinkedIn and ignores unlinked or unknown providers', () => {
    assert.deepEqual(
      resolveDeleteAccountMethods(
        user(LINKEDIN_UID, 'facebook.com', 'phone', 'google.com', 'password'),
      ),
      ['password', 'google', 'facebook', 'linkedin'],
    );
    assert.deepEqual(resolveDeleteAccountMethods(user(PASSWORD_UID, 'google.com')), ['google']);
    assert.deepEqual(resolveDeleteAccountMethods(user(PASSWORD_UID, 'phone')), []);
    assert.deepEqual(resolveDeleteAccountMethods(user(PASSWORD_UID, '\x61pple.com')), []);
    assert.deepEqual(resolveDeleteAccountMethods(null), []);
  });

  it('never infers a provider from email; LinkedIn only from the li_ UID', () => {
    const withEmail = {
      uid: PASSWORD_UID,
      providerIds: [],
      email: 'person@gmail.com',
    } as DeleteAccountUserSnapshot;
    assert.deepEqual(resolveDeleteAccountMethods(withEmail), []);
    assert.deepEqual(resolveDeleteAccountMethods(user(LINKEDIN_UID)), ['linkedin']);
    assert.deepEqual(resolveDeleteAccountMethods(user('li_x')), []);
  });

  it('filters by build availability and falls back to recent sign-in for LinkedIn', () => {
    const all = user(LINKEDIN_UID, 'password', 'google.com', 'facebook.com');
    assert.deepEqual(
      resolveDeleteAccountOptions(all, { google: false, facebook: true, linkedin: true }),
      { methods: ['password', 'facebook', 'linkedin'], recentSignInFallback: false },
    );
    assert.deepEqual(
      resolveDeleteAccountOptions(user(LINKEDIN_UID), {
        google: true,
        facebook: true,
        linkedin: false,
      }),
      { methods: [], recentSignInFallback: true },
    );
    assert.deepEqual(
      resolveDeleteAccountOptions(user(PASSWORD_UID, 'google.com'), {
        google: true,
        facebook: true,
        linkedin: false,
      }),
      { methods: ['google'], recentSignInFallback: false },
    );
  });
});

describe('deleteMyAccount flow — success per provider', () => {
  for (const [method, providerIds, uid] of [
    ['password', ['password'], PASSWORD_UID],
    ['google', ['google.com'], PASSWORD_UID],
    ['facebook', ['facebook.com'], PASSWORD_UID],
    ['linkedin', [], LINKEDIN_UID],
  ] as const) {
    it(`${method}: reauth → callable with {} exactly once → cleanup`, async () => {
      const h = harness(user(uid, ...providerIds));
      const run = createDeleteAccountFlow(h.deps);
      const outcome = await run({
        method,
        password: method === 'password' ? SECRET_PASSWORD : undefined,
      });
      assert.deepEqual(outcome, { status: 'deleted', alreadyDeleted: false });
      assert.deepEqual(h.calls, [
        `reauth:${method}`,
        `callable:${DELETE_MY_ACCOUNT_CALLABLE}`,
        'cleanup:same-uid',
      ]);
      assert.equal(h.payloads.length, 1);
      assert.deepEqual(h.payloads[0], {});
      assert.equal(Object.keys(h.payloads[0] as object).length, 0);
    });
  }

  it('callable name is deleteMyAccount', () => {
    assert.equal(DELETE_MY_ACCOUNT_CALLABLE, 'deleteMyAccount');
  });

  it('password is handed to the password reauth only', async () => {
    const received: Array<string | undefined> = [];
    const h = harness(user(PASSWORD_UID, 'password'));
    h.deps.reauthenticate.password = async ({ password }) => {
      received.push(password);
    };
    await createDeleteAccountFlow(h.deps)({ method: 'password', password: SECRET_PASSWORD });
    assert.deepEqual(received, [SECRET_PASSWORD]);
  });

  it('ALREADY_DELETED (lost response, retry) is still a confirmed deletion', async () => {
    const h = harness(user(PASSWORD_UID, 'google.com'), {
      invokeCallable: async () => ({ ok: true, status: 'ALREADY_DELETED' }),
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.deepEqual(outcome, { status: 'deleted', alreadyDeleted: true });
  });

  it('cleanup failure after a confirmed deletion still reports deleted, never deletes again', async () => {
    let callableCalls = 0;
    const h = harness(user(PASSWORD_UID, 'google.com'), {
      invokeCallable: async () => {
        callableCalls += 1;
        return { ok: true, status: 'DELETED' };
      },
      cleanupAfterDeletion: async () => {
        throw new Error('signOut failed');
      },
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.equal(outcome.status, 'deleted');
    assert.equal(callableCalls, 1);
  });
});

describe('Multiple linked providers', () => {
  it('uses only the chosen linked method', async () => {
    const h = harness(user(PASSWORD_UID, 'password', 'google.com', 'facebook.com'));
    await createDeleteAccountFlow(h.deps)({ method: 'facebook' });
    assert.deepEqual(h.calls.filter((c) => c.startsWith('reauth:')), ['reauth:facebook']);
  });

  it('a method that is not linked is refused without reauth or callable', async () => {
    const h = harness(user(PASSWORD_UID, 'google.com'));
    const run = createDeleteAccountFlow(h.deps);
    for (const method of ['password', 'facebook', 'linkedin'] as const) {
      const outcome = await run({ method, password: SECRET_PASSWORD });
      assert.equal(outcome.status, 'failed');
      assert.equal(outcome.status === 'failed' && outcome.kind, 'method_unavailable');
    }
    assert.deepEqual(h.calls, []);
  });

  it('missing adapter for a linked method is refused', async () => {
    const h = harness(user(PASSWORD_UID, 'google.com'));
    delete h.deps.reauthenticate.google;
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'method_unavailable');
    assert.deepEqual(h.calls, []);
  });
});

describe('Same UID before and after reauthentication', () => {
  it('UID change after reauth aborts before the callable', async () => {
    const h = harness(user(PASSWORD_UID, 'google.com'));
    h.deps.reauthenticate.google = async () => {
      h.setUser(user('Zz9yXw8vUt7sRq6pOn5mLk4jIh3g', 'google.com'));
    };
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.deepEqual(outcome, {
      status: 'failed',
      kind: 'uid_changed',
      messageKey: 'settings.deleteAccount.reauthMismatch',
    });
    assert.equal(h.payloads.length, 0);
    assert.ok(!h.calls.some((c) => c.startsWith('cleanup')));
  });

  it('signed out after reauth aborts before the callable', async () => {
    const h = harness(user(PASSWORD_UID, 'google.com'));
    h.deps.reauthenticate.google = async () => {
      h.setUser(null);
    };
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'uid_changed');
    assert.equal(h.payloads.length, 0);
  });

  it('no session → unauthenticated without any call', async () => {
    const h = harness(null);
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'unauthenticated');
    assert.deepEqual(h.calls, []);
  });
});

describe('Cancellation, wrong credentials and reauth errors never delete', () => {
  const cases: Array<[DeleteAccountMethod, unknown, string]> = [
    ['google', new DeleteAccountReauthError('CANCELLED', 'x'), 'reauth_cancelled'],
    ['facebook', Object.assign(new Error('x'), { code: 'CANCELLED' }), 'reauth_cancelled'],
    ['linkedin', new DeleteAccountReauthError('CANCELLED', 'x'), 'reauth_cancelled'],
    ['google', Object.assign(new Error('x'), { code: 'auth/user-mismatch' }), 'reauth_mismatch'],
    ['facebook', Object.assign(new Error('x'), { code: 'USER_MISMATCH' }), 'reauth_mismatch'],
    ['password', Object.assign(new Error('x'), { code: 'auth/wrong-password' }), 'wrong_password'],
    ['password', Object.assign(new Error('x'), { code: 'auth/invalid-credential' }), 'wrong_password'],
    ['google', Object.assign(new Error('x'), { code: 'auth/invalid-credential' }), 'reauth_failed'],
    ['google', Object.assign(new Error('x'), { code: 'auth/network-request-failed' }), 'reauth_network'],
    ['facebook', Object.assign(new Error('x'), { code: 'NOT_CONFIGURED' }), 'method_unavailable'],
    ['google', Object.assign(new Error('x'), { code: 'auth/user-token-expired' }), 'user_not_found'],
    ['linkedin', new DeleteAccountReauthError('LINKEDIN_UID_UNVERIFIED', 'x'), 'linkedin_guidance'],
    ['google', new Error('unexpected'), 'reauth_failed'],
  ];

  for (const [method, error, kind] of cases) {
    it(`${method} ${String((error as { code?: string }).code ?? 'plain')} → ${kind}`, async () => {
      const uid = method === 'linkedin' ? LINKEDIN_UID : PASSWORD_UID;
      const h = harness(user(uid, 'password', 'google.com', 'facebook.com'));
      h.deps.reauthenticate[method] = async () => {
        throw error;
      };
      const outcome = await createDeleteAccountFlow(h.deps)({
        method,
        password: SECRET_PASSWORD,
      });
      assert.equal(outcome.status, 'failed');
      assert.equal(outcome.status === 'failed' && outcome.kind, kind);
      assert.equal(h.payloads.length, 0);
      assert.ok(!h.calls.some((c) => c.startsWith('cleanup')));
    });
  }

  it('provider flow already open → silent in_progress', async () => {
    const h = harness(user(PASSWORD_UID, 'facebook.com'));
    h.deps.reauthenticate.facebook = async () => {
      throw Object.assign(new Error('x'), { code: 'OPERATION_IN_PROGRESS' });
    };
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'facebook' });
    assert.deepEqual(outcome, { status: 'in_progress' });
    assert.equal(h.payloads.length, 0);
  });

  it('empty password never reaches reauth or the callable', async () => {
    const h = harness(user(PASSWORD_UID, 'password'));
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'password', password: '' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'wrong_password');
    assert.deepEqual(h.calls, []);
  });
});

describe('Double tap and retry', () => {
  it('a second attempt while one is running is dropped; only one callable', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = harness(user(PASSWORD_UID, 'google.com'));
    h.deps.reauthenticate.google = async () => {
      await gate;
    };
    const run = createDeleteAccountFlow(h.deps);
    const first = run({ method: 'google' });
    const second = await run({ method: 'google' });
    assert.deepEqual(second, { status: 'in_progress' });
    release();
    assert.equal((await first).status, 'deleted');
    assert.equal(h.payloads.length, 1);
  });

  it('the lock is released after failures and thrown errors so retry works', async () => {
    let attempt = 0;
    const h = harness(user(PASSWORD_UID, 'google.com'), {
      invokeCallable: async (name, payload) => {
        attempt += 1;
        h.payloads.push(payload);
        if (attempt === 1) {
          throw Object.assign(new Error('x'), {
            code: 'functions/unavailable',
            details: { reason: 'DELETION_RETRYABLE', retryable: true, stage: 'storage' },
          });
        }
        return { ok: true, status: 'DELETED' };
      },
    });
    const run = createDeleteAccountFlow(h.deps);
    const first = await run({ method: 'google' });
    assert.equal(first.status === 'failed' && first.kind, 'retryable');
    const retry = await run({ method: 'google' });
    assert.equal(retry.status, 'deleted');
    assert.equal(h.payloads.length, 2);
  });

  it('lock is released even when getCurrentUser throws', async () => {
    let shouldThrow = true;
    const h = harness(user(PASSWORD_UID, 'google.com'));
    const original = h.deps.getCurrentUser;
    h.deps.getCurrentUser = () => {
      if (shouldThrow) throw new Error('boom');
      return original();
    };
    const run = createDeleteAccountFlow(h.deps);
    await assert.rejects(run({ method: 'google' }));
    shouldThrow = false;
    assert.equal((await run({ method: 'google' })).status, 'deleted');
  });
});

describe('Backend errors map details.reason; failures never clean up or sign out', () => {
  const cases: Array<[string, Record<string, unknown> | undefined, string]> = [
    ['functions/failed-precondition', { reason: 'RECENT_LOGIN_REQUIRED', maxAuthAgeSeconds: 300 }, 'stale_session'],
    ['functions/failed-precondition', { reason: 'APP_CHECK_REQUIRED' }, 'app_check'],
    ['functions/unauthenticated', { reason: 'UNAUTHENTICATED' }, 'unauthenticated'],
    ['functions/unavailable', { reason: 'DELETION_RETRYABLE', retryable: true, stage: 'matching' }, 'retryable'],
    ['functions/internal', { reason: 'DELETION_FAILED', retryable: false, stage: 'users-tree' }, 'partial'],
    ['functions/invalid-argument', { reason: 'INVALID_ARGUMENT' }, 'unknown'],
    ['functions/unavailable', undefined, 'network'],
    ['functions/deadline-exceeded', undefined, 'network'],
    ['auth/network-request-failed', undefined, 'network'],
    ['auth/user-not-found', undefined, 'user_not_found'],
    ['auth/user-token-expired', undefined, 'user_not_found'],
    ['functions/unauthenticated', undefined, 'unauthenticated'],
    ['UNAUTHENTICATED', undefined, 'unauthenticated'],
    ['functions/not-found', undefined, 'unknown'],
    ['functions/internal', { reason: 'SOMETHING_NEW' }, 'unknown'],
  ];

  for (const [code, details, kind] of cases) {
    it(`${code} ${String(details?.reason ?? '')} → ${kind}`, async () => {
      let signOuts = 0;
      const h = harness(user(PASSWORD_UID, 'google.com'), {
        invokeCallable: rejectWith(code, details),
        cleanupAfterDeletion: async () => {
          signOuts += 1;
        },
      });
      const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
      assert.equal(outcome.status, 'failed');
      assert.equal(outcome.status === 'failed' && outcome.kind, kind);
      assert.equal(
        outcome.status === 'failed' && outcome.messageKey,
        deleteAccountMessageKey(kind as never),
      );
      assert.equal(signOuts, 0);
      assert.equal(mapDeleteMyAccountFailure({ code, details }), kind);
    });
  }

  it('unconfirmed responses never count as success', async () => {
    for (const data of [null, {}, { ok: false }, { ok: true }, { ok: true, status: 'PENDING' }, 'ok']) {
      let cleanups = 0;
      const h = harness(user(PASSWORD_UID, 'google.com'), {
        invokeCallable: async () => data,
        cleanupAfterDeletion: async () => {
          cleanups += 1;
        },
      });
      const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
      assert.equal(outcome.status === 'failed' && outcome.kind, 'unknown', JSON.stringify(data));
      assert.equal(cleanups, 0);
      assert.equal(readConfirmedDeletion(data), null);
    }
  });
});

describe('Recent sign-in fallback (LinkedIn only)', () => {
  it('skips client reauth for li_ accounts; the backend enforces auth_time', async () => {
    const h = harness(user(LINKEDIN_UID));
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_sign_in' });
    assert.equal(outcome.status, 'deleted');
    assert.deepEqual(h.calls, [`callable:${DELETE_MY_ACCOUNT_CALLABLE}`, 'cleanup:same-uid']);
  });

  it('stale sign-in shows the LinkedIn guidance', async () => {
    const h = harness(user(LINKEDIN_UID), {
      invokeCallable: rejectWith('functions/failed-precondition', {
        reason: 'RECENT_LOGIN_REQUIRED',
      }),
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_sign_in' });
    assert.deepEqual(outcome, {
      status: 'failed',
      kind: 'linkedin_guidance',
      messageKey: 'settings.deleteAccount.linkedInGuidance',
    });
  });

  it('is refused for accounts without LinkedIn', async () => {
    const h = harness(user(PASSWORD_UID, 'password', 'google.com'));
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_sign_in' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'method_unavailable');
    assert.deepEqual(h.calls, []);
  });
});

describe('LinkedIn same-UID reauthentication', () => {
  function linkedInDeps(overrides: {
    currentUid?: () => string | null;
    flow?: { status: string; customToken?: string; error?: { code?: unknown } };
    signIn?: (token: string) => Promise<{ uid: string }>;
  } = {}) {
    const events: string[] = [];
    return {
      events,
      deps: {
        getCurrentUid: overrides.currentUid ?? (() => LINKEDIN_UID),
        runBrowserFlow: async () => {
          events.push('browser');
          return (
            overrides.flow ?? {
              status: 'authenticated',
              customToken: customToken({ uid: LINKEDIN_UID, iss: 'sa', sub: 'sa' }),
            }
          );
        },
        signInWithCustomToken:
          overrides.signIn ??
          (async () => {
            events.push('signIn');
            return { uid: LINKEDIN_UID };
          }),
      },
    };
  }

  it('same UID → signInWithCustomToken renews auth_time', async () => {
    const { deps, events } = linkedInDeps();
    await reauthenticateWithLinkedInSameUid(deps);
    assert.deepEqual(events, ['browser', 'signIn']);
  });

  it('token for another LinkedIn account never signs in', async () => {
    const { deps, events } = linkedInDeps({
      flow: {
        status: 'authenticated',
        customToken: customToken({ uid: 'li_AnotherPersonEntirely' }),
      },
    });
    await assert.rejects(
      reauthenticateWithLinkedInSameUid(deps),
      (err: unknown) => (err as DeleteAccountReauthError).code === 'USER_MISMATCH',
    );
    assert.deepEqual(events, ['browser']);
  });

  it('undecodable token → guidance, never signs in', async () => {
    for (const token of ['not-a-jwt', 'a.%%%.c', customToken({ sub: 'x' })]) {
      const { deps, events } = linkedInDeps({
        flow: { status: 'authenticated', customToken: token },
      });
      await assert.rejects(
        reauthenticateWithLinkedInSameUid(deps),
        (err: unknown) => (err as DeleteAccountReauthError).code === 'LINKEDIN_UID_UNVERIFIED',
      );
      assert.deepEqual(events, ['browser']);
    }
  });

  it('session changed while the browser was open → mismatch, no sign-in', async () => {
    let reads = 0;
    const { deps, events } = linkedInDeps({
      currentUid: () => (reads++ === 0 ? LINKEDIN_UID : null),
    });
    await assert.rejects(
      reauthenticateWithLinkedInSameUid(deps),
      (err: unknown) => (err as DeleteAccountReauthError).code === 'USER_MISMATCH',
    );
    assert.deepEqual(events, ['browser']);
  });

  it('cancel / dismiss / provider error / busy / network map without signing in', async () => {
    const expectations: Array<[Parameters<typeof linkedInDeps>[0]['flow'], string]> = [
      [{ status: 'cancelled' }, 'CANCELLED'],
      [{ status: 'dismissed' }, 'CANCELLED'],
      [{ status: 'provider_error' }, 'FAILED'],
      [{ status: 'failed', error: { code: 'OPERATION_IN_PROGRESS' } }, 'IN_PROGRESS'],
      [{ status: 'failed', error: { code: 'NETWORK' } }, 'NETWORK'],
      [{ status: 'failed', error: { code: 'APP_CHECK_NOT_READY' } }, 'FAILED'],
    ];
    for (const [flow, code] of expectations) {
      const { deps, events } = linkedInDeps({ flow });
      await assert.rejects(
        reauthenticateWithLinkedInSameUid(deps),
        (err: unknown) => (err as DeleteAccountReauthError).code === code,
      );
      assert.deepEqual(events, ['browser']);
    }
  });

  it('non-LinkedIn session never opens the browser', async () => {
    const { deps, events } = linkedInDeps({ currentUid: () => PASSWORD_UID });
    await assert.rejects(
      reauthenticateWithLinkedInSameUid(deps),
      (err: unknown) => (err as DeleteAccountReauthError).code === 'FAILED',
    );
    assert.deepEqual(events, []);
  });

  it('sign-in failures and a different resulting UID are rejected', async () => {
    const network = linkedInDeps({
      signIn: async () => {
        throw Object.assign(new Error('x'), { code: 'auth/network-request-failed' });
      },
    });
    await assert.rejects(
      reauthenticateWithLinkedInSameUid(network.deps),
      (err: unknown) => (err as DeleteAccountReauthError).code === 'NETWORK',
    );
    const other = linkedInDeps({ signIn: async () => ({ uid: 'li_SomeoneElseEntirely' }) });
    await assert.rejects(
      reauthenticateWithLinkedInSameUid(other.deps),
      (err: unknown) => (err as DeleteAccountReauthError).code === 'USER_MISMATCH',
    );
  });

  it('readCustomTokenUid reads only the uid claim', () => {
    assert.equal(readCustomTokenUid(customToken({ uid: LINKEDIN_UID })), LINKEDIN_UID);
    assert.equal(readCustomTokenUid(customToken({ uid: 'li_ñandú_Ünicode' })), 'li_ñandú_Ünicode');
    assert.equal(readCustomTokenUid(customToken({ uid: '' })), null);
    assert.equal(readCustomTokenUid(customToken({ uid: 42 })), null);
    assert.equal(readCustomTokenUid('a.b'), null);
    assert.equal(readCustomTokenUid(undefined), null);
    assert.equal(readCustomTokenUid(`x.${base64Url('not json')}.y`), null);
  });
});

describe('Post-deletion cleanup', () => {
  function cleanupDeps(events: string[], overrides: Record<string, unknown> = {}) {
    return {
      clearSocialPrefill: () => {
        events.push('prefill');
      },
      closePublicationGate: () => {
        events.push('gate');
      },
      stopBackground: async () => {
        events.push('background');
      },
      drainInFlightPublications: async () => {
        events.push('drain');
      },
      signOutProviderSessions: async () => {
        events.push('providers');
      },
      signOut: async () => {
        events.push('signOut');
      },
      clearLocalAccountState: async (uid: string) => {
        events.push(`local:${uid === LINKEDIN_UID ? 'uid' : 'other'}`);
      },
      ...overrides,
    };
  }

  it('closes Visibility, stops background, drains, signs out providers and Firebase, clears local state', async () => {
    const events: string[] = [];
    await runAccountDeletionCleanup(LINKEDIN_UID, cleanupDeps(events));
    assert.deepEqual(events, [
      'prefill',
      'gate',
      'background',
      'drain',
      'providers',
      'signOut',
      'local:uid',
    ]);
  });

  it('local state is cleared even when signOut fails', async () => {
    const events: string[] = [];
    await assert.rejects(
      runAccountDeletionCleanup(
        LINKEDIN_UID,
        cleanupDeps(events, {
          signOut: async () => {
            throw new Error('x');
          },
        }),
      ),
    );
    assert.equal(events.at(-1), 'local:uid');
  });

  it('background stop and drain failures never block signOut', async () => {
    const events: string[] = [];
    await runAccountDeletionCleanup(
      LINKEDIN_UID,
      cleanupDeps(events, {
        stopBackground: async () => {
          throw new Error('x');
        },
        drainInFlightPublications: async () => {
          throw new Error('x');
        },
      }),
    );
    assert.ok(events.includes('signOut'));
  });
});

describe('Diagnostics carry no secrets or PII', () => {
  it('dev logs only hold stage, kind, code and reason', async () => {
    const token = customToken({ uid: LINKEDIN_UID });
    const scenarios: Array<Partial<DeleteAccountFlowDeps>> = [
      { invokeCallable: rejectWith('functions/failed-precondition', { reason: 'APP_CHECK_REQUIRED' }) },
      { invokeCallable: rejectWith('functions/unavailable') },
      { invokeCallable: async () => ({ ok: false }) },
      {
        cleanupAfterDeletion: async () => {
          throw Object.assign(new Error(token), { code: 'auth/unknown' });
        },
      },
    ];
    const logs: DeleteAccountDevLog[] = [];
    for (const overrides of scenarios) {
      const h = harness(user(LINKEDIN_UID, 'password'), overrides);
      h.deps.logDev = (entry) => logs.push(entry);
      await createDeleteAccountFlow(h.deps)({ method: 'password', password: SECRET_PASSWORD });
    }
    const failing = harness(user(LINKEDIN_UID, 'password'));
    failing.deps.reauthenticate.password = async () => {
      throw Object.assign(new Error(`bad ${SECRET_PASSWORD}`), { code: 'auth/wrong-password' });
    };
    failing.deps.logDev = (entry) => logs.push(entry);
    await createDeleteAccountFlow(failing.deps)({ method: 'password', password: SECRET_PASSWORD });

    assert.ok(logs.length >= 5);
    const serialized = JSON.stringify(logs);
    for (const secret of [LINKEDIN_UID, SECRET_PASSWORD, token, 'internal', '@']) {
      assert.equal(serialized.includes(secret), false, secret);
    }
    for (const entry of logs) {
      assert.deepEqual(
        Object.keys(entry).filter((k) => !['stage', 'kind', 'code', 'reason'].includes(k)),
        [],
      );
    }
  });

  it('a throwing logger never breaks the flow', async () => {
    const h = harness(user(PASSWORD_UID, 'google.com'), {
      invokeCallable: rejectWith('functions/unavailable'),
      logDev: () => {
        throw new Error('logger down');
      },
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'network');
  });
});
