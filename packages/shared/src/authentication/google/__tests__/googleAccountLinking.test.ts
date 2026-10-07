/**
 * ENH-AUTH-LINK-01 (Google): Login preventive warning gate, explicit Google
 * linking use case (pure, fake deps), screen-wide linking lock and the
 * evidence-only sign-in methods resolver.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/authentication/google/__tests__/googleAccountLinking.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createExclusiveLinkRunner,
  type AccountLinkOutcome,
  type AccountLinkUserSnapshot,
} from '../../accountLinking/accountLinkingCore.ts';
import {
  classifyGoogleTokenFailure,
  createLinkGoogleToCurrentUser,
  hasGoogleLinked,
  messageKeyForGoogleLinkError,
  type LinkGoogleToCurrentUserDeps,
} from '../googleAccountLinking.ts';
import { createLinkFacebookToCurrentUser } from '../../facebook/facebookAccountLinking.ts';
import { createGoogleLoginWarningGate } from '../googleLoginWarning.ts';
import { resolveSignInMethods } from '../../signInMethods.ts';

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
const OTHER_UID = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa98';
const LINKEDIN_UID = 'li_Q2hhbmdlTWVQbGVhc2UtVGhpcy1Jcy1Ob3QtUmVhbA';

function firebaseError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Firebase: ${code}`), { code });
}

function sdkError(code: string, message = 'sdk'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

type Profile = { displayName: string; affiliations: string[] };

type Harness = {
  deps: LinkGoogleToCurrentUserDeps;
  calls: string[];
  linkArgs: Array<{ token: string; expectedUid: string }>;
  state: { user: AccountLinkUserSnapshot | null; users: number; profiles: Map<string, Profile> };
};

function harness(
  overrides: Partial<LinkGoogleToCurrentUserDeps> = {},
  initial: AccountLinkUserSnapshot | null = { uid: UID, providerIds: ['password'] },
): Harness {
  const calls: string[] = [];
  const linkArgs: Harness['linkArgs'] = [];
  const profiles = new Map<string, Profile>();
  if (initial) profiles.set(initial.uid, { displayName: 'Profile', affiliations: ['a1'] });
  const state = { user: initial, users: initial ? 1 : 0, profiles };
  let tokenCounter = 0;
  const deps: LinkGoogleToCurrentUserDeps = {
    getCurrentUser: () => {
      calls.push('getCurrentUser');
      return state.user;
    },
    confirm: async () => {
      calls.push('confirm');
      return true;
    },
    isConfigured: () => true,
    requestIdToken: async () => {
      calls.push('requestIdToken');
      tokenCounter += 1;
      return { idToken: `google-id-token-${tokenCounter}` };
    },
    linkWithIdToken: async (token, expectedUid) => {
      calls.push('linkWithIdToken');
      linkArgs.push({ token, expectedUid });
      const current = state.user!;
      state.user = { uid: current.uid, providerIds: [...current.providerIds, 'google.com'] };
      return state.user;
    },
    reloadCurrentUser: async () => {
      calls.push('reloadCurrentUser');
      return state.user;
    },
    discardProviderSession: () => {
      calls.push('discardProviderSession');
    },
    ...overrides,
  };
  return { deps, calls, linkArgs, state };
}

describe('Login preventive warning gate', () => {
  it('Google from Login shows the confirmation before anything else', async () => {
    const events: string[] = [];
    const request = createGoogleLoginWarningGate();
    await request(
      async () => {
        events.push('confirm');
        return true;
      },
      () => {
        events.push('signIn');
      },
    );
    assert.deepEqual(events, ['confirm', 'signIn']);
  });

  it('Go back never opens Google', async () => {
    let signIns = 0;
    const result = await createGoogleLoginWarningGate()(async () => false, () => {
      signIns += 1;
    });
    assert.equal(result, 'cancelled');
    assert.equal(signIns, 0);
  });

  it('a failing confirmation UI is treated as Go back', async () => {
    let signIns = 0;
    const result = await createGoogleLoginWarningGate()(
      async () => {
        throw new Error('ui');
      },
      () => {
        signIns += 1;
      },
    );
    assert.equal(result, 'cancelled');
    assert.equal(signIns, 0);
  });

  it('Continue starts exactly one Google sign-in', async () => {
    let signIns = 0;
    const result = await createGoogleLoginWarningGate()(async () => true, () => {
      signIns += 1;
    });
    assert.equal(result, 'started');
    assert.equal(signIns, 1);
  });

  it('double tap: one warning and one attempt; locked until the attempt ends', async () => {
    const request = createGoogleLoginWarningGate();
    let confirms = 0;
    let signIns = 0;
    let release!: (value: boolean) => void;
    let finishSignIn!: () => void;
    const confirm = () => {
      confirms += 1;
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    };
    const signIn = () => {
      signIns += 1;
      return new Promise<void>((resolve) => {
        finishSignIn = resolve;
      });
    };
    const first = request(confirm, signIn);
    assert.equal(await request(confirm, signIn), 'ignored');
    release(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await request(confirm, signIn), 'ignored');
    finishSignIn();
    assert.equal(await first, 'started');
    assert.equal(confirms, 1);
    assert.equal(signIns, 1);

    const retry = request(async () => false, signIn);
    assert.equal(await retry, 'cancelled');
  });
});

describe('Sign-in methods presentation (evidence only)', () => {
  it('password, google.com and facebook.com appear connected when present', () => {
    assert.deepEqual(
      resolveSignInMethods({ uid: UID, providerIds: ['password', 'google.com', 'facebook.com'] }),
      [
        { id: 'email', connected: true },
        { id: 'google', connected: true },
        { id: 'facebook', connected: true },
      ],
    );
  });

  it('Google and Facebook absent → listed as not connected (connect actions)', () => {
    assert.deepEqual(resolveSignInMethods({ uid: UID, providerIds: ['password'] }), [
      { id: 'email', connected: true },
      { id: 'google', connected: false },
      { id: 'facebook', connected: false },
    ]);
  });

  it('Email row only with the password provider (no connect-email in scope)', () => {
    assert.equal(
      resolveSignInMethods({ uid: UID, providerIds: ['google.com'] }).some((m) => m.id === 'email'),
      false,
    );
  });

  it('phone is never listed as a sign-in method', () => {
    const methods = resolveSignInMethods({ uid: UID, providerIds: ['phone', 'password'] });
    assert.deepEqual(methods.map((m) => m.id), ['email', 'google', 'facebook']);
  });

  it('LinkedIn only from the li_ UID contract; never from a Firebase auto UID', () => {
    assert.deepEqual(resolveSignInMethods({ uid: LINKEDIN_UID, providerIds: [] }), [
      { id: 'google', connected: false },
      { id: 'facebook', connected: false },
      { id: 'linkedin', connected: true },
    ]);
    for (const uid of ['li_', 'li_abc', UID, 'xli_abcdefgh', 'LI_abcdefgh']) {
      assert.equal(
        resolveSignInMethods({ uid, providerIds: [] }).some((m) => m.id === 'linkedin'),
        false,
        uid,
      );
    }
  });

  it('no inference from email or unknown providers', () => {
    assert.deepEqual(
      resolveSignInMethods({ uid: UID, providerIds: ['firebase', 'unknown.provider', null, undefined] }),
      [
        { id: 'google', connected: false },
        { id: 'facebook', connected: false },
      ],
    );
    assert.equal(hasGoogleLinked({ uid: UID, providerIds: ['password'] }), false);
    assert.equal(hasGoogleLinked(null), false);
  });
});

describe('createLinkGoogleToCurrentUser — linking keeps the same UID', () => {
  it('Email account → Google: password + google.com, same UID, one fresh token', async () => {
    const h = harness();
    const outcome = await createLinkGoogleToCurrentUser(h.deps)();
    assert.deepEqual(outcome, { status: 'linked', providerIds: ['password', 'google.com'] });
    const order = ['confirm', 'requestIdToken', 'linkWithIdToken', 'reloadCurrentUser', 'discardProviderSession'];
    assert.deepEqual(h.calls.filter((c) => order.includes(c)), order);
    assert.deepEqual(h.linkArgs, [{ token: 'google-id-token-1', expectedUid: UID }]);
    assert.equal(h.state.user?.uid, UID);
  });

  it('Facebook account → Google: facebook.com + google.com', async () => {
    const h = harness({}, { uid: UID, providerIds: ['facebook.com'] });
    assert.deepEqual(await createLinkGoogleToCurrentUser(h.deps)(), {
      status: 'linked',
      providerIds: ['facebook.com', 'google.com'],
    });
  });

  it('LinkedIn account → Google: same li_ UID, profile untouched, no user created', async () => {
    const h = harness({}, { uid: LINKEDIN_UID, providerIds: [] });
    const profileBefore = structuredClone(h.state.profiles.get(LINKEDIN_UID));
    const outcome = await createLinkGoogleToCurrentUser(h.deps)();
    assert.deepEqual(outcome, { status: 'linked', providerIds: ['google.com'] });
    assert.equal(h.state.user?.uid, LINKEDIN_UID);
    assert.equal(h.state.users, 1);
    assert.deepEqual(h.state.profiles.get(LINKEDIN_UID), profileBefore);
    assert.deepEqual([...h.state.profiles.keys()], [LINKEDIN_UID]);
  });

  it('Google already linked → alreadyLinked without opening the SDK', async () => {
    const h = harness({}, { uid: UID, providerIds: ['google.com'] });
    assert.deepEqual(await createLinkGoogleToCurrentUser(h.deps)(), {
      status: 'alreadyLinked',
      providerIds: ['google.com'],
    });
    assert.deepEqual(h.calls, ['getCurrentUser']);
  });

  it('Google result without email links fine (only the ID token is used)', async () => {
    const h = harness({ requestIdToken: async () => ({ idToken: 'google-id-token-x' }) });
    assert.equal((await createLinkGoogleToCurrentUser(h.deps)()).status, 'linked');
  });

  it('requests a fresh ID token on every attempt', async () => {
    const h = harness({
      linkWithIdToken: async (token, expectedUid) => {
        h.linkArgs.push({ token, expectedUid });
        throw firebaseError('auth/network-request-failed');
      },
    });
    const link = createLinkGoogleToCurrentUser(h.deps);
    await link();
    await link();
    assert.deepEqual(h.linkArgs.map((a) => a.token), ['google-id-token-1', 'google-id-token-2']);
  });
});

describe('createLinkGoogleToCurrentUser — cancellation and guards', () => {
  it('declining the confirmation is silent and never opens Google', async () => {
    const h = harness({
      confirm: async () => {
        h.calls.push('confirm');
        return false;
      },
    });
    assert.deepEqual(await createLinkGoogleToCurrentUser(h.deps)(), { status: 'cancelled' });
    assert.equal(h.calls.includes('requestIdToken'), false);
  });

  it('cancelling the Google picker is silent; session discarded; retry possible', async () => {
    let cancel = true;
    const h = harness({
      requestIdToken: async () => {
        if (cancel) throw sdkError('SIGN_IN_CANCELLED', 'Google sign-in was cancelled.');
        return { idToken: 'google-id-token-retry' };
      },
    });
    const link = createLinkGoogleToCurrentUser(h.deps);
    assert.deepEqual(await link(), { status: 'cancelled' });
    assert.equal(h.calls.at(-1), 'discardProviderSession');
    assert.equal(h.calls.includes('linkWithIdToken'), false);
    cancel = false;
    assert.equal((await link()).status, 'linked');
  });

  it('double tap → second call ignored; one picker', async () => {
    let release!: (value: boolean) => void;
    let hold = true;
    const h = harness({
      confirm: () =>
        hold
          ? new Promise<boolean>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(true),
    });
    const link = createLinkGoogleToCurrentUser(h.deps);
    const first = link();
    assert.deepEqual(await link(), { status: 'ignored' });
    release(true);
    assert.equal((await first).status, 'linked');
    assert.equal(h.calls.filter((c) => c === 'requestIdToken').length, 1);
    hold = false;
  });

  it('signed out → NOT_AUTHENTICATED without confirmation or SDK', async () => {
    const h = harness({}, null);
    const outcome = await createLinkGoogleToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'NOT_AUTHENTICATED');
    assert.deepEqual(h.calls, ['getCurrentUser']);
  });

  it('session closed during the picker → NOT_AUTHENTICATED, no link', async () => {
    const h = harness({
      requestIdToken: async () => {
        h.state.user = null;
        return { idToken: 'google-id-token-x' };
      },
    });
    const outcome = await createLinkGoogleToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'NOT_AUTHENTICATED');
    assert.equal(h.calls.includes('linkWithIdToken'), false);
  });

  it('UID changed during the picker → USER_CHANGED, no link', async () => {
    const h = harness({
      requestIdToken: async () => {
        h.state.user = { uid: OTHER_UID, providerIds: ['password'] };
        return { idToken: 'google-id-token-x' };
      },
    });
    const outcome = await createLinkGoogleToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'USER_CHANGED');
    assert.equal(h.calls.includes('linkWithIdToken'), false);
  });

  it('link result on another UID is rejected (never reported as linked)', async () => {
    const h = harness({
      linkWithIdToken: async () => ({ uid: OTHER_UID, providerIds: ['google.com'] }),
    });
    assert.deepEqual(await createLinkGoogleToCurrentUser(h.deps)(), {
      status: 'failed',
      code: 'USER_CHANGED',
      diagnosticCode: 'LINK_UID_MISMATCH',
    });
  });

  it('missing credential → TOKEN_MISSING, friendly message, no link', async () => {
    for (const requestIdToken of [
      async () => ({ idToken: '' }),
      async () => ({ idToken: null }),
      async () => {
        throw sdkError('MISSING_ID_TOKEN');
      },
    ]) {
      const h = harness({ requestIdToken });
      const outcome = await createLinkGoogleToCurrentUser(h.deps)();
      assert.equal(outcome.status === 'failed' && outcome.code, 'TOKEN_MISSING');
      assert.equal(h.calls.includes('linkWithIdToken'), false);
      assert.equal(messageKeyForGoogleLinkError('TOKEN_MISSING'), 'settings.signInMethods.errors.generic');
    }
  });

  it('SDK failures classify without leaking details', () => {
    assert.deepEqual(classifyGoogleTokenFailure(sdkError('SIGN_IN_IN_PROGRESS')), { kind: 'cancelled' });
    assert.equal(
      (classifyGoogleTokenFailure(sdkError('PLAY_SERVICES_UNAVAILABLE')) as { code: string }).code,
      'NOT_CONFIGURED',
    );
    assert.equal(
      (classifyGoogleTokenFailure(sdkError('SIGN_IN_FAILED', 'Network unreachable')) as { code: string }).code,
      'NETWORK_ERROR',
    );
    assert.equal((classifyGoogleTokenFailure(new Error('boom')) as { code: string }).code, 'UNKNOWN');
  });
});

describe('createLinkGoogleToCurrentUser — Firebase link errors', () => {
  for (const [firebaseCode, code, leaf] of [
    ['auth/credential-already-in-use', 'CREDENTIAL_IN_USE', 'googleInUse'],
    ['auth/email-already-in-use', 'EMAIL_IN_USE', 'googleInUse'],
    ['auth/requires-recent-login', 'REQUIRES_RECENT_LOGIN', 'requiresRecentLogin'],
    ['auth/internal-error', 'UNKNOWN', 'generic'],
  ] as const) {
    it(`${firebaseCode} → ${code}; same UID, providers intact, no move, retry possible`, async () => {
      const h = harness({
        linkWithIdToken: async () => {
          throw firebaseError(firebaseCode);
        },
      });
      const before = structuredClone(h.state);
      const link = createLinkGoogleToCurrentUser(h.deps);
      const outcome = await link();
      assert.deepEqual(outcome, { status: 'failed', code, diagnosticCode: firebaseCode });
      assert.equal(messageKeyForGoogleLinkError(code), `settings.signInMethods.errors.${leaf}`);
      assert.deepEqual(h.state, before);
      assert.equal(h.calls.at(-1), 'discardProviderSession');
      assert.notDeepEqual(await link(), { status: 'ignored' });
    });
  }

  it('provider-already-linked → alreadyLinked only when reload shows google.com on the same UID', async () => {
    const ok = harness({
      linkWithIdToken: async () => {
        ok.state.user = { uid: UID, providerIds: ['password', 'google.com'] };
        throw firebaseError('auth/provider-already-linked');
      },
    });
    assert.deepEqual(await createLinkGoogleToCurrentUser(ok.deps)(), {
      status: 'alreadyLinked',
      providerIds: ['password', 'google.com'],
    });

    const notOnUser = harness({
      linkWithIdToken: async () => {
        throw firebaseError('auth/provider-already-linked');
      },
    });
    assert.equal((await createLinkGoogleToCurrentUser(notOnUser.deps)()).status, 'failed');

    const otherUid = harness({
      linkWithIdToken: async () => {
        otherUid.state.user = { uid: OTHER_UID, providerIds: ['google.com'] };
        throw firebaseError('auth/provider-already-linked');
      },
    });
    assert.equal((await createLinkGoogleToCurrentUser(otherUid.deps)()).status, 'failed');
  });

  it('outcomes and dev logs never contain the token, UID or email', async () => {
    const g = globalThis as { __DEV__?: boolean };
    const previousDev = g.__DEV__;
    const originalLog = console.log;
    const logged: string[] = [];
    g.__DEV__ = true;
    console.log = (...args: unknown[]) => {
      logged.push(JSON.stringify(args));
    };
    try {
      const outcomes: unknown[] = [];
      for (const code of ['auth/credential-already-in-use', 'auth/internal-error']) {
        const h = harness({
          linkWithIdToken: async () => {
            throw firebaseError(code);
          },
        });
        outcomes.push(await createLinkGoogleToCurrentUser(h.deps)());
      }
      outcomes.push(await createLinkGoogleToCurrentUser(harness().deps)());
      const serialized = JSON.stringify(outcomes) + logged.join('\n');
      assert.ok(logged.length >= 2);
      for (const secret of ['google-id-token', UID, '@']) {
        assert.equal(serialized.includes(secret), false, secret);
      }
    } finally {
      console.log = originalLog;
      if (previousDev === undefined) delete g.__DEV__;
      else g.__DEV__ = previousDev;
    }
  });
});

describe('Screen-wide linking lock (Google ↔ Facebook)', () => {
  function pendingTask() {
    let finish!: (outcome: AccountLinkOutcome) => void;
    const promise = new Promise<AccountLinkOutcome>((resolve) => {
      finish = resolve;
    });
    return { promise, finish };
  }

  it('Facebook is blocked while Google is in progress', async () => {
    const runner = createExclusiveLinkRunner<'google' | 'facebook'>();
    const google = pendingTask();
    let facebookStarted = false;
    const first = runner.run('google', () => google.promise);
    assert.equal(runner.activeProvider(), 'google');
    assert.deepEqual(
      await runner.run('facebook', async () => {
        facebookStarted = true;
        return { status: 'cancelled' };
      }),
      { status: 'ignored' },
    );
    assert.equal(facebookStarted, false);
    google.finish({ status: 'cancelled' });
    await first;
    assert.equal(runner.activeProvider(), null);
  });

  it('Google is blocked while Facebook is in progress; double tap blocked; lock released after errors', async () => {
    const runner = createExclusiveLinkRunner<'google' | 'facebook'>();
    const facebook = pendingTask();
    const first = runner.run('facebook', () => facebook.promise);
    assert.deepEqual(await runner.run('google', async () => ({ status: 'cancelled' })), {
      status: 'ignored',
    });
    assert.deepEqual(await runner.run('facebook', async () => ({ status: 'cancelled' })), {
      status: 'ignored',
    });
    facebook.finish({ status: 'failed', code: 'UNKNOWN' });
    await first;

    await assert.rejects(runner.run('google', async () => {
      throw new Error('unexpected');
    }));
    assert.equal(runner.activeProvider(), null);
    assert.deepEqual(await runner.run('google', async () => ({ status: 'cancelled' })), {
      status: 'cancelled',
    });
  });

  it('Google and Facebook linkers together keep every provider on the same UID', async () => {
    const state: { user: AccountLinkUserSnapshot } = { user: { uid: UID, providerIds: ['password'] } };
    const linkTo = (providerId: string) => async (_token: string, expectedUid: string) => {
      assert.equal(expectedUid, UID);
      state.user = { uid: state.user.uid, providerIds: [...state.user.providerIds, providerId] };
      return state.user;
    };
    const common = {
      getCurrentUser: () => state.user,
      confirm: async () => true,
      isConfigured: () => true,
      reloadCurrentUser: async () => state.user,
      discardProviderSession: () => {},
    };
    const runner = createExclusiveLinkRunner<'google' | 'facebook'>();
    const google = createLinkGoogleToCurrentUser({
      ...common,
      requestIdToken: async () => ({ idToken: 'google-id-token' }),
      linkWithIdToken: linkTo('google.com'),
    });
    const facebook = createLinkFacebookToCurrentUser({
      ...common,
      requestAccessToken: async () => ({ accessToken: 'facebook-access-token' }),
      linkWithAccessToken: linkTo('facebook.com'),
    });
    assert.equal((await runner.run('google', google)).status, 'linked');
    assert.equal((await runner.run('facebook', facebook)).status, 'linked');
    assert.deepEqual(state.user, { uid: UID, providerIds: ['password', 'google.com', 'facebook.com'] });
  });
});
