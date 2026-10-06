/**
 * ENH-AUTH-LINK-01: explicit Facebook linking use case (pure, fake deps) and
 * the evidence-only sign-in methods resolver.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/authentication/facebook/__tests__/facebookAccountLinking.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FACEBOOK_LINK_USER_CHANGED_CODE,
  createLinkFacebookToCurrentUser,
  hasFacebookLinked,
  mapFacebookLinkFailure,
  messageKeyForFacebookLinkError,
  toFacebookLinkUserSnapshot,
  type FacebookLinkUserSnapshot,
  type LinkFacebookToCurrentUserDeps,
} from '../facebookAccountLinking.ts';
import { FacebookAuthenticationError } from '../facebookAuthCore.ts';
import { resolveSignInMethods } from '../../signInMethods.ts';

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
const OTHER_UID = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa98';
const PREVIOUS = ['password', 'google.com'] as const;

function firebaseError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Firebase: ${code}`), { code });
}

type Harness = {
  deps: LinkFacebookToCurrentUserDeps;
  calls: string[];
  linkArgs: Array<{ token: string; expectedUid: string }>;
  state: { user: FacebookLinkUserSnapshot | null };
};

function harness(
  overrides: Partial<LinkFacebookToCurrentUserDeps> = {},
  initial: FacebookLinkUserSnapshot | null = { uid: UID, providerIds: [...PREVIOUS] },
): Harness {
  const calls: string[] = [];
  const linkArgs: Harness['linkArgs'] = [];
  const state = { user: initial };
  let tokenCounter = 0;
  const deps: LinkFacebookToCurrentUserDeps = {
    getCurrentUser: () => {
      calls.push('getCurrentUser');
      return state.user;
    },
    confirm: async () => {
      calls.push('confirm');
      return true;
    },
    isConfigured: () => true,
    requestAccessToken: async () => {
      calls.push('requestAccessToken');
      tokenCounter += 1;
      return { accessToken: `fresh-token-${tokenCounter}` };
    },
    linkWithAccessToken: async (token, expectedUid) => {
      calls.push('linkWithAccessToken');
      linkArgs.push({ token, expectedUid });
      const current = state.user!;
      state.user = {
        uid: current.uid,
        providerIds: [...current.providerIds, 'facebook.com'],
      };
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

describe('createLinkFacebookToCurrentUser — happy path', () => {
  it('confirm → fresh token → link on the pinned UID → reload → linked; session discarded', async () => {
    const h = harness();
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.deepEqual(outcome, {
      status: 'linked',
      providerIds: ['password', 'google.com', 'facebook.com'],
    });
    const order = ['confirm', 'requestAccessToken', 'linkWithAccessToken', 'reloadCurrentUser', 'discardProviderSession'];
    assert.deepEqual(h.calls.filter((c) => order.includes(c)), order);
    assert.deepEqual(h.linkArgs, [{ token: 'fresh-token-1', expectedUid: UID }]);
    assert.equal(h.state.user?.uid, UID);
  });

  it('previous providers are preserved after linking', async () => {
    const h = harness();
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status, 'linked');
    if (outcome.status !== 'linked') return;
    for (const provider of PREVIOUS) assert.ok(outcome.providerIds.includes(provider), provider);
  });

  it('requests a fresh token on every attempt (no cached token)', async () => {
    const h = harness({
      linkWithAccessToken: async (token, expectedUid) => {
        h.linkArgs.push({ token, expectedUid });
        throw firebaseError('auth/network-request-failed');
      },
    });
    const link = createLinkFacebookToCurrentUser(h.deps);
    await link();
    await link();
    assert.deepEqual(h.linkArgs.map((a) => a.token), ['fresh-token-1', 'fresh-token-2']);
    assert.equal(h.calls.filter((c) => c === 'requestAccessToken').length, 2);
  });

  it('Facebook without email links fine (no email needed anywhere)', async () => {
    const h = harness({}, { uid: UID, providerIds: ['password'] });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status, 'linked');
    assert.deepEqual(
      toFacebookLinkUserSnapshot({
        uid: UID,
        providerData: [{ providerId: 'password' }, { providerId: 'facebook.com' }],
      }),
      { uid: UID, providerIds: ['password', 'facebook.com'] },
    );
  });

  it('reload failure after a successful link still reports linked from the link result', async () => {
    const h = harness({
      reloadCurrentUser: async () => {
        throw firebaseError('auth/network-request-failed');
      },
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.deepEqual(outcome, {
      status: 'linked',
      providerIds: ['password', 'google.com', 'facebook.com'],
    });
  });
});

describe('createLinkFacebookToCurrentUser — guards before Facebook', () => {
  it('unauthenticated user → NOT_AUTHENTICATED, no confirm, no SDK', async () => {
    const h = harness({}, null);
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.status === 'failed' && outcome.code, 'NOT_AUTHENTICATED');
    assert.deepEqual(h.calls, ['getCurrentUser']);
  });

  it('Facebook already linked → alreadyLinked without any SDK call', async () => {
    const h = harness({}, { uid: UID, providerIds: ['google.com', 'facebook.com'] });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.deepEqual(outcome, {
      status: 'alreadyLinked',
      providerIds: ['google.com', 'facebook.com'],
    });
    assert.deepEqual(h.calls, ['getCurrentUser']);
  });

  it('Facebook not configured → NOT_CONFIGURED before confirmation', async () => {
    const h = harness({ isConfigured: () => false });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'NOT_CONFIGURED');
    assert.equal(h.calls.includes('confirm'), false);
  });

  it('explicit confirmation is required; declining touches nothing', async () => {
    const h = harness({
      confirm: async () => {
        h.calls.push('confirm');
        return false;
      },
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.deepEqual(outcome, { status: 'cancelled' });
    assert.deepEqual(h.calls, ['getCurrentUser', 'confirm']);
  });
});

describe('createLinkFacebookToCurrentUser — cancel, double tap and session cleanup', () => {
  it('Facebook login cancel → cancelled (no technical error), session discarded, no link', async () => {
    const h = harness({
      requestAccessToken: async () => {
        throw new FacebookAuthenticationError('CANCELLED', 'User cancelled.');
      },
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.deepEqual(outcome, { status: 'cancelled' });
    assert.equal(h.calls.includes('linkWithAccessToken'), false);
    assert.equal(h.calls.at(-1), 'discardProviderSession');
  });

  it('double tap → second call ignored while the first is running; retry works afterwards', async () => {
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
    const link = createLinkFacebookToCurrentUser(h.deps);
    const first = link();
    assert.deepEqual(await link(), { status: 'ignored' });
    release(false);
    assert.deepEqual(await first, { status: 'cancelled' });
    assert.equal(h.calls.includes('requestAccessToken'), false);

    hold = false;
    assert.equal((await link()).status, 'linked');
    assert.equal(h.calls.filter((c) => c === 'requestAccessToken').length, 1);
  });

  it('missing token → TOKEN_MISSING, session discarded, no link', async () => {
    const h = harness({ requestAccessToken: async () => ({ accessToken: '   ' }) });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'TOKEN_MISSING');
    assert.equal(h.calls.includes('linkWithAccessToken'), false);
    assert.equal(h.calls.at(-1), 'discardProviderSession');
  });

  it('SDK network failure → NETWORK_ERROR; other SDK failure → UNKNOWN', async () => {
    const network = harness({
      requestAccessToken: async () => {
        throw new Error('Network connection lost');
      },
    });
    assert.equal(
      ((await createLinkFacebookToCurrentUser(network.deps)()) as { code: string }).code,
      'NETWORK_ERROR',
    );
    const other = harness({
      requestAccessToken: async () => {
        throw new Error('boom');
      },
    });
    assert.equal(
      ((await createLinkFacebookToCurrentUser(other.deps)()) as { code: string }).code,
      'UNKNOWN',
    );
  });

  it('a throwing session discard never masks the outcome', async () => {
    const h = harness({
      discardProviderSession: () => {
        throw new Error('logout failed');
      },
    });
    assert.equal((await createLinkFacebookToCurrentUser(h.deps)()).status, 'linked');
  });

  it('unexpected throw (e.g. confirmation UI) → failed UNKNOWN and the lock is released', async () => {
    let throws = true;
    const h = harness({
      confirm: async () => {
        if (throws) throw new Error('ui');
        return true;
      },
    });
    const link = createLinkFacebookToCurrentUser(h.deps);
    const outcome = await link();
    assert.equal(outcome.status === 'failed' && outcome.code, 'UNKNOWN');
    throws = false;
    assert.equal((await link()).status, 'linked');
  });
});

describe('createLinkFacebookToCurrentUser — stable UID', () => {
  it('signed-in user changed during Facebook login → USER_CHANGED, no link', async () => {
    const h = harness({
      requestAccessToken: async () => {
        h.state.user = { uid: OTHER_UID, providerIds: ['password'] };
        return { accessToken: 'fresh-token-x' };
      },
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'USER_CHANGED');
    assert.equal(h.calls.includes('linkWithAccessToken'), false);
  });

  it('user signed out during Facebook login → NOT_AUTHENTICATED, no link', async () => {
    const h = harness({
      requestAccessToken: async () => {
        h.state.user = null;
        return { accessToken: 'fresh-token-x' };
      },
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status === 'failed' && outcome.code, 'NOT_AUTHENTICATED');
    assert.equal(h.calls.includes('linkWithAccessToken'), false);
  });

  it('link result with a different UID is rejected (never reported as linked)', async () => {
    const h = harness({
      linkWithAccessToken: async () => ({ uid: OTHER_UID, providerIds: ['facebook.com'] }),
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.deepEqual(outcome, {
      status: 'failed',
      code: 'USER_CHANGED',
      diagnosticCode: 'LINK_UID_MISMATCH',
    });
  });

  it('adapter user-changed code maps to USER_CHANGED', () => {
    assert.equal(
      mapFacebookLinkFailure(firebaseError(FACEBOOK_LINK_USER_CHANGED_CODE)).code,
      'USER_CHANGED',
    );
  });
});

describe('createLinkFacebookToCurrentUser — Firebase link errors', () => {
  async function failWith(code: string) {
    const h = harness({
      linkWithAccessToken: async () => {
        throw firebaseError(code);
      },
    });
    const before = { ...h.state.user!, providerIds: [...h.state.user!.providerIds] };
    const link = createLinkFacebookToCurrentUser(h.deps);
    const outcome = await link();
    return { h, before, outcome, link };
  }

  for (const [firebaseCode, code, leaf] of [
    ['auth/credential-already-in-use', 'CREDENTIAL_IN_USE', 'credentialInUse'],
    ['auth/email-already-in-use', 'EMAIL_IN_USE', 'emailInUse'],
    ['auth/account-exists-with-different-credential', 'EMAIL_IN_USE', 'emailInUse'],
    ['auth/requires-recent-login', 'REQUIRES_RECENT_LOGIN', 'requiresRecentLogin'],
    ['auth/network-request-failed', 'NETWORK_ERROR', 'network'],
    ['auth/internal-error', 'UNKNOWN', 'generic'],
  ] as const) {
    it(`${firebaseCode} → ${code}; same UID, providers intact, session discarded, retry possible`, async () => {
      const { h, before, outcome, link } = await failWith(firebaseCode);
      assert.deepEqual(outcome, { status: 'failed', code, diagnosticCode: firebaseCode });
      assert.equal(messageKeyForFacebookLinkError(code), `settings.signInMethods.errors.${leaf}`);
      assert.deepEqual(h.state.user, before);
      assert.equal(h.calls.at(-1), 'discardProviderSession');
      assert.equal(h.calls.includes('reloadCurrentUser'), false);
      assert.notDeepEqual(await link(), { status: 'ignored' });
    });
  }

  it('provider-already-linked → alreadyLinked only when Facebook is on the current UID', async () => {
    const h = harness({
      linkWithAccessToken: async () => {
        h.state.user = { uid: UID, providerIds: [...PREVIOUS, 'facebook.com'] };
        throw firebaseError('auth/provider-already-linked');
      },
    });
    assert.deepEqual(await createLinkFacebookToCurrentUser(h.deps)(), {
      status: 'alreadyLinked',
      providerIds: [...PREVIOUS, 'facebook.com'],
    });
  });

  it('provider-already-linked without Facebook on the current UID → failed, not success', async () => {
    const h = harness({
      linkWithAccessToken: async () => {
        throw firebaseError('auth/provider-already-linked');
      },
    });
    const outcome = await createLinkFacebookToCurrentUser(h.deps)();
    assert.equal(outcome.status, 'failed');
    assert.deepEqual(h.state.user?.providerIds, [...PREVIOUS]);
  });

  it('error mapping table', () => {
    const table: Record<string, string> = {
      'auth/credential-already-in-use': 'CREDENTIAL_IN_USE',
      'auth/email-already-in-use': 'EMAIL_IN_USE',
      'auth/requires-recent-login': 'REQUIRES_RECENT_LOGIN',
      'auth/no-current-user': 'NOT_AUTHENTICATED',
      'auth/user-token-expired': 'NOT_AUTHENTICATED',
      'auth/user-mismatch': 'USER_CHANGED',
      'auth/operation-not-allowed': 'NOT_CONFIGURED',
      'auth/something-new': 'UNKNOWN',
    };
    for (const [firebaseCode, code] of Object.entries(table)) {
      assert.equal(mapFacebookLinkFailure(firebaseError(firebaseCode)).code, code, firebaseCode);
    }
    assert.deepEqual(mapFacebookLinkFailure(new Error('no code')), {
      code: 'UNKNOWN',
      diagnosticCode: 'LINK_UNKNOWN',
    });
  });
});

describe('No tokens or PII', () => {
  it('snapshot keeps only uid + provider ids (drops email, name, tokens)', () => {
    const snapshot = toFacebookLinkUserSnapshot({
      uid: UID,
      email: 'person@example.com',
      displayName: 'Person',
      providerData: [{ providerId: 'google.com', email: 'person@example.com' } as { providerId: string }],
    } as Parameters<typeof toFacebookLinkUserSnapshot>[0]);
    assert.deepEqual(snapshot, { uid: UID, providerIds: ['google.com'] });
    assert.equal(toFacebookLinkUserSnapshot(null), null);
    assert.equal(toFacebookLinkUserSnapshot({ uid: '' }), null);
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
      for (const code of ['auth/credential-already-in-use', 'auth/requires-recent-login', 'auth/internal-error']) {
        const h = harness({
          linkWithAccessToken: async () => {
            throw firebaseError(code);
          },
        });
        outcomes.push(await createLinkFacebookToCurrentUser(h.deps)());
      }
      const h = harness();
      outcomes.push(await createLinkFacebookToCurrentUser(h.deps)());
      const serialized = JSON.stringify(outcomes) + logged.join('\n');
      assert.ok(logged.length >= 3);
      for (const secret of ['fresh-token', UID, '@']) {
        assert.equal(serialized.includes(secret), false, secret);
      }
    } finally {
      console.log = originalLog;
      if (previousDev === undefined) delete g.__DEV__;
      else g.__DEV__ = previousDev;
    }
  });
});

describe('resolveSignInMethods (evidence only)', () => {
  it('Email + Google from providerData; Facebook listed as not connected', () => {
    assert.deepEqual(resolveSignInMethods({ uid: UID, providerIds: ['password', 'google.com'] }), [
      { id: 'email', connected: true },
      { id: 'google', connected: true },
      { id: 'facebook', connected: false },
    ]);
  });

  it('Facebook connected state', () => {
    assert.deepEqual(resolveSignInMethods({ uid: UID, providerIds: ['google.com', 'facebook.com'] }), [
      { id: 'google', connected: true },
      { id: 'facebook', connected: true },
    ]);
  });

  it('LinkedIn only from the li_ UID contract; never from a Firebase auto UID', () => {
    assert.deepEqual(resolveSignInMethods({ uid: 'li_Q2hhbmdlTWVQbGVhc2U', providerIds: [] }), [
      { id: 'facebook', connected: false },
      { id: 'linkedin', connected: true },
    ]);
    assert.deepEqual(resolveSignInMethods({ uid: 'li_', providerIds: [] }), [
      { id: 'facebook', connected: false },
    ]);
    assert.deepEqual(resolveSignInMethods({ uid: UID, providerIds: [] }), [
      { id: 'facebook', connected: false },
    ]);
  });

  it('no inference from email: unknown providers and email-like data add nothing', () => {
    assert.deepEqual(
      resolveSignInMethods({ uid: UID, providerIds: ['firebase', 'unknown.provider', null, undefined] }),
      [{ id: 'facebook', connected: false }],
    );
    assert.equal(hasFacebookLinked({ uid: UID, providerIds: ['password'] }), false);
    assert.equal(hasFacebookLinked(null), false);
  });
});
