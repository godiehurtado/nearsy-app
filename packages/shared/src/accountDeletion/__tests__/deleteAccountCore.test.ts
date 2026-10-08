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
  isLinkedInOnlyAccount,
  mapDeleteMyAccountFailure,
  readConfirmedDeletion,
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
  it('orders password, Google, Facebook and ignores unlinked or unknown providers', () => {
    assert.deepEqual(
      resolveDeleteAccountMethods(
        user(LINKEDIN_UID, 'facebook.com', 'phone', 'google.com', 'password'),
      ),
      ['password', 'google', 'facebook'],
    );
    assert.deepEqual(resolveDeleteAccountMethods(user(PASSWORD_UID, 'google.com')), ['google']);
    assert.deepEqual(resolveDeleteAccountMethods(user(PASSWORD_UID, 'phone')), []);
    assert.deepEqual(resolveDeleteAccountMethods(user(PASSWORD_UID, '\x61pple.com')), []);
    assert.deepEqual(resolveDeleteAccountMethods(null), []);
  });

  it('LinkedIn is never a reauthentication method', () => {
    assert.deepEqual(resolveDeleteAccountMethods(user(LINKEDIN_UID)), []);
    assert.deepEqual(resolveDeleteAccountMethods(user(LINKEDIN_UID, 'oidc.linkedin')), []);
  });

  it('never infers a provider from email; LinkedIn only from the li_ UID', () => {
    const withEmail = {
      uid: PASSWORD_UID,
      providerIds: [],
      email: 'person@gmail.com',
    } as DeleteAccountUserSnapshot;
    assert.deepEqual(resolveDeleteAccountMethods(withEmail), []);
    assert.equal(isLinkedInOnlyAccount(withEmail), false);
    assert.equal(isLinkedInOnlyAccount(user(LINKEDIN_UID)), true);
    assert.equal(isLinkedInOnlyAccount(user('li_x')), false);
  });

  it('LinkedIn-only accounts get the recent-session path; LinkedIn + another provider gets that provider', () => {
    assert.deepEqual(
      resolveDeleteAccountOptions(user(LINKEDIN_UID), { google: true, facebook: true }),
      { methods: [], recentSessionOnly: true },
    );
    for (const [providerId, method] of [
      ['password', 'password'],
      ['google.com', 'google'],
      ['facebook.com', 'facebook'],
    ] as const) {
      assert.deepEqual(
        resolveDeleteAccountOptions(user(LINKEDIN_UID, providerId), {
          google: true,
          facebook: true,
        }),
        { methods: [method], recentSessionOnly: false },
      );
    }
  });

  it('filters by build availability', () => {
    assert.deepEqual(
      resolveDeleteAccountOptions(user(PASSWORD_UID, 'password', 'google.com', 'facebook.com'), {
        google: false,
        facebook: true,
      }),
      { methods: ['password', 'facebook'], recentSessionOnly: false },
    );
    assert.deepEqual(
      resolveDeleteAccountOptions(user(LINKEDIN_UID, 'google.com'), {
        google: false,
        facebook: false,
      }),
      { methods: [], recentSessionOnly: false },
    );
  });
});

describe('deleteMyAccount flow — success per provider', () => {
  for (const [method, providerIds, uid] of [
    ['password', ['password'], PASSWORD_UID],
    ['google', ['google.com'], PASSWORD_UID],
    ['facebook', ['facebook.com'], PASSWORD_UID],
    ['password', ['password'], LINKEDIN_UID],
    ['google', ['google.com'], LINKEDIN_UID],
    ['facebook', ['facebook.com'], LINKEDIN_UID],
  ] as const) {
    it(`${method}${uid === LINKEDIN_UID ? ' (LinkedIn account)' : ''}: reauth → callable with {} exactly once → cleanup`, async () => {
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
    for (const method of ['password', 'facebook'] as const) {
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
    ['google', Object.assign(new Error('x'), { code: 'auth/user-mismatch' }), 'reauth_mismatch'],
    ['facebook', Object.assign(new Error('x'), { code: 'USER_MISMATCH' }), 'reauth_mismatch'],
    ['password', Object.assign(new Error('x'), { code: 'auth/wrong-password' }), 'wrong_password'],
    ['password', Object.assign(new Error('x'), { code: 'auth/invalid-credential' }), 'wrong_password'],
    ['google', Object.assign(new Error('x'), { code: 'auth/invalid-credential' }), 'reauth_failed'],
    ['google', Object.assign(new Error('x'), { code: 'auth/network-request-failed' }), 'reauth_network'],
    ['facebook', Object.assign(new Error('x'), { code: 'NOT_CONFIGURED' }), 'method_unavailable'],
    ['google', Object.assign(new Error('x'), { code: 'auth/user-token-expired' }), 'user_not_found'],
    ['google', new Error('unexpected'), 'reauth_failed'],
  ];

  for (const [method, error, kind] of cases) {
    it(`${method} ${String((error as { code?: string }).code ?? 'plain')} → ${kind}`, async () => {
      const h = harness(user(PASSWORD_UID, 'password', 'google.com', 'facebook.com'));
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

describe('LinkedIn-only accounts: recent session, no inline reauthentication', () => {
  function linkedInHarness(overrides: Partial<DeleteAccountFlowDeps> = {}) {
    const h = harness(user(LINKEDIN_UID), overrides);
    const uidReads: Array<string | null | undefined> = [];
    const original = h.deps.getCurrentUser;
    h.deps.getCurrentUser = () => {
      const snapshot = original();
      uidReads.push(snapshot?.uid);
      return snapshot;
    };
    return { ...h, uidReads };
  }

  it('recent session: calls deleteMyAccount({}) directly, no reauth, then cleans up', async () => {
    const h = linkedInHarness();
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_session' });
    assert.deepEqual(outcome, { status: 'deleted', alreadyDeleted: false });
    assert.deepEqual(h.calls, [`callable:${DELETE_MY_ACCOUNT_CALLABLE}`, 'cleanup:same-uid']);
    assert.deepEqual(h.payloads, [{}]);
  });

  it('stale session (RECENT_LOGIN_REQUIRED) shows the LinkedIn guidance and changes nothing', async () => {
    let cleanups = 0;
    const payloads: unknown[] = [];
    const h = linkedInHarness({
      invokeCallable: async (name, payload) => {
        payloads.push(payload);
        throw Object.assign(new Error('internal'), {
          code: 'functions/failed-precondition',
          details: { reason: 'RECENT_LOGIN_REQUIRED', maxAuthAgeSeconds: 300 },
        });
      },
      cleanupAfterDeletion: async () => {
        cleanups += 1;
      },
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_session' });
    assert.deepEqual(outcome, {
      status: 'failed',
      kind: 'linkedin_guidance',
      messageKey: 'settings.deleteAccount.linkedInGuidance',
    });
    assert.equal(cleanups, 0);
    assert.deepEqual(payloads, [{}]);
    assert.ok(h.uidReads.length > 0);
    assert.ok(h.uidReads.every((uid) => uid === LINKEDIN_UID));
  });

  it('auth/requires-recent-login is treated the same way', async () => {
    const h = linkedInHarness({ invokeCallable: rejectWith('auth/requires-recent-login') });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_session' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'linkedin_guidance');
  });

  it('after the guidance the person can retry once they signed in again', async () => {
    let attempt = 0;
    const h = linkedInHarness({
      invokeCallable: async () => {
        attempt += 1;
        if (attempt === 1) {
          throw Object.assign(new Error('x'), {
            code: 'functions/failed-precondition',
            details: { reason: 'RECENT_LOGIN_REQUIRED' },
          });
        }
        return { ok: true, status: 'DELETED' };
      },
    });
    const run = createDeleteAccountFlow(h.deps);
    assert.equal((await run({ method: 'recent_session' })).status, 'failed');
    assert.equal((await run({ method: 'recent_session' })).status, 'deleted');
  });

  it('other backend errors keep their own messages', async () => {
    const h = linkedInHarness({
      invokeCallable: rejectWith('functions/failed-precondition', { reason: 'APP_CHECK_REQUIRED' }),
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_session' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'app_check');
  });

  it('the flow has no sign-in or user-creation capability', () => {
    const h = linkedInHarness();
    assert.deepEqual(Object.keys(h.deps).sort(), [
      'cleanupAfterDeletion',
      'getCurrentUser',
      'invokeCallable',
      'logDev',
      'reauthenticate',
    ]);
    assert.deepEqual(Object.keys(h.deps.reauthenticate).sort(), ['facebook', 'google', 'password']);
  });

  it('recent session is refused when a reauthenticable provider is linked or LinkedIn is absent', async () => {
    for (const snapshot of [
      user(LINKEDIN_UID, 'google.com'),
      user(LINKEDIN_UID, 'password'),
      user(LINKEDIN_UID, 'facebook.com'),
      user(PASSWORD_UID, 'password', 'google.com'),
      user(PASSWORD_UID),
    ]) {
      const h = harness(snapshot);
      const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_session' });
      assert.equal(outcome.status === 'failed' && outcome.kind, 'method_unavailable');
      assert.deepEqual(h.calls, []);
    }
  });

  it('LinkedIn + Google/Facebook/password: a safe method deletes after reauth', async () => {
    for (const [providerId, method] of [
      ['google.com', 'google'],
      ['facebook.com', 'facebook'],
      ['password', 'password'],
    ] as const) {
      const h = harness(user(LINKEDIN_UID, providerId));
      const outcome = await createDeleteAccountFlow(h.deps)({
        method,
        password: SECRET_PASSWORD,
      });
      assert.equal(outcome.status, 'deleted');
      assert.equal(h.calls[0], `reauth:${method}`);
    }
  });

  it('UID change during the recent-session attempt aborts before the callable', async () => {
    let reads = 0;
    const h = harness(user(LINKEDIN_UID));
    h.deps.getCurrentUser = () =>
      reads++ === 0 ? user(LINKEDIN_UID) : user('li_SomeoneElseEntirely');
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'recent_session' });
    assert.equal(outcome.status === 'failed' && outcome.kind, 'uid_changed');
    assert.equal(h.payloads.length, 0);
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
    const token = 'eyJhbGciOiJSUzI1NiJ9.secret-token.signature';
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

describe('Exit barrier ordering', () => {
  function withBarrier(
    initialUser: DeleteAccountUserSnapshot,
    overrides: Partial<DeleteAccountFlowDeps> = {},
  ) {
    const h = harness(initialUser, overrides);
    const record = (name: string) => () => {
      h.calls.push(`barrier:${name}`);
    };
    h.deps.exitBarrier = {
      beginRequest: record('begin'),
      abandonRequest: record('abandon'),
      confirmDeletion: record('confirm'),
      finishCleanup: record('finish'),
    };
    return h;
  }

  it('begin before the callable, confirm before any cleanup, finish after it', async () => {
    const h = withBarrier(user(PASSWORD_UID, 'password'));
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'password', password: SECRET_PASSWORD });
    assert.equal(outcome.status, 'deleted');
    assert.deepEqual(h.calls, [
      'reauth:password',
      'barrier:begin',
      `callable:${DELETE_MY_ACCOUNT_CALLABLE}`,
      'barrier:confirm',
      'cleanup:same-uid',
      'barrier:finish',
    ]);
  });

  it('cleanup failure still finishes the barrier', async () => {
    const h = withBarrier(user(PASSWORD_UID, 'google.com'), {
      cleanupAfterDeletion: async () => {
        throw Object.assign(new Error('x'), { code: 'auth/internal-error' });
      },
    });
    const outcome = await createDeleteAccountFlow(h.deps)({ method: 'google' });
    assert.equal(outcome.status, 'deleted');
    assert.deepEqual(h.calls.slice(-2), ['barrier:confirm', 'barrier:finish']);
  });

  it('callable errors and unconfirmed responses abandon; nothing else', async () => {
    for (const invokeCallable of [rejectWith('functions/unavailable'), async () => ({ ok: true })]) {
      const h = withBarrier(user(PASSWORD_UID, 'facebook.com'), { invokeCallable });
      const outcome = await createDeleteAccountFlow(h.deps)({ method: 'facebook' });
      assert.equal(outcome.status, 'failed');
      assert.deepEqual(
        h.calls.filter((c) => c.startsWith('barrier:')),
        ['barrier:begin', 'barrier:abandon'],
      );
      assert.ok(!h.calls.some((c) => c.startsWith('cleanup')));
    }
  });

  it('reauth failure, cancellation and UID change never touch the barrier', async () => {
    const cases: Array<[Partial<DeleteAccountFlowDeps>, DeleteAccountMethod]> = [
      [{ reauthenticate: { google: rejectWith('CANCELLED') } }, 'google'],
      [{ reauthenticate: { google: rejectWith('auth/invalid-credential') } }, 'google'],
    ];
    for (const [overrides, method] of cases) {
      const h = withBarrier(user(PASSWORD_UID, 'google.com'), overrides);
      await createDeleteAccountFlow(h.deps)({ method });
      assert.ok(!h.calls.some((c) => c.startsWith('barrier:')));
    }

    const wrong = withBarrier(user(PASSWORD_UID, 'password'), {
      reauthenticate: { password: rejectWith('auth/wrong-password') },
    });
    await createDeleteAccountFlow(wrong.deps)({ method: 'password', password: 'nope' });
    assert.ok(!wrong.calls.some((c) => c.startsWith('barrier:')));

    const swapped = withBarrier(user(PASSWORD_UID, 'google.com'));
    swapped.deps.reauthenticate.google = async () => {
      swapped.setUser(user('Other0000000000000000000000a', 'google.com'));
    };
    await createDeleteAccountFlow(swapped.deps)({ method: 'google' });
    assert.ok(!swapped.calls.some((c) => c.startsWith('barrier:')));
  });
});
