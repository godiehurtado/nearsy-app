/**
 * LinkedIn A3.4.4 Firebase session integration tests.
 * Mocks only — no real Firebase Auth, network, browser, or SecureStore.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';

import {
  __resetLinkedInAuthClientLocksForTests,
  LINKEDIN_AUTH_EXCHANGE_CALLABLE,
  LINKEDIN_AUTH_START_CALLABLE,
  LINKEDIN_MOBILE_RETURN_URL,
  LINKEDIN_TX_STORAGE_KEY,
  createLinkedInTransactionStore,
  createMemorySecureKv,
  linkedInAuthStart,
  type PkceCrypto,
} from '../linkedinAuthCore.ts';
import { __resetLinkedInCoordinatorForTests } from '../linkedinAuthCoordinator.ts';
import {
  mapFirebaseCustomTokenError,
  signInWithLinkedInCustomToken,
  isTerminalFirebaseSignInError,
  isUncertainFirebaseSignInError,
  type LinkedInFirebaseAuthPort,
} from '../linkedinFirebaseAuth.ts';
import {
  __resetLinkedInSessionForTests,
  authenticateWithLinkedInBrowser,
  authenticateWithLinkedInColdStartClaim,
  assertLinkedInPendingExchangeClaim,
  expectedLinkedInSuccessFingerprint,
  getLinkedInFirebaseUncertainBarrier,
  reconcileLinkedInFirebaseUncertainState,
  type LinkedInSessionDeps,
} from '../linkedinSession.ts';
import type { LinkedInAuthBrowser } from '../linkedinBrowserSession.ts';

const TX = 'tx_synth_session012345';
const SYNTH_TOKEN = 'synth.custom.token.NOT_REAL';

function nodePkceCrypto(): PkceCrypto {
  return {
    getRandomBytes: (n) => randomBytes(n),
    sha256: (utf8) => createHash('sha256').update(utf8, 'utf8').digest(),
  };
}

function successUrl(tx = TX): string {
  return `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=${tx}&result=ok`;
}

function createMockAuth(opts?: {
  initialUid?: string | null;
  authResolution?:
    | { status: 'pending' }
    | { status: 'resolved'; uid: string | null };
  signInImpl?: (token: string) => Promise<{ uid: string }>;
}): LinkedInFirebaseAuthPort & {
  signInCalls: string[];
  getIdTokenCalls: number;
  signOutCalls: number;
  setCurrentUid: (uid: string | null) => void;
  setAuthResolution: (
    snap:
      | { status: 'pending' }
      | { status: 'resolved'; uid: string | null },
  ) => void;
  setResolutionThrows: (value: boolean) => void;
} {
  let currentUid: string | null = opts?.initialUid ?? null;
  let resolution:
    | { status: 'pending' }
    | { status: 'resolved'; uid: string | null } =
    opts?.authResolution ?? { status: 'resolved', uid: currentUid };
  let resolutionThrows = false;
  const signInCalls: string[] = [];
  return {
    signInCalls,
    getIdTokenCalls: 0,
    signOutCalls: 0,
    setCurrentUid(uid: string | null) {
      currentUid = uid;
      if (resolution.status === 'resolved') {
        resolution = { status: 'resolved', uid };
      }
    },
    setAuthResolution(snap) {
      resolution = snap;
      if (snap.status === 'resolved') {
        currentUid = snap.uid;
      }
    },
    setResolutionThrows(value: boolean) {
      resolutionThrows = value;
    },
    getCurrentUserId: () => currentUid,
    getAuthResolution: () => {
      if (resolutionThrows) {
        throw new Error('resolution probe failed');
      }
      return resolution;
    },
    async signInWithCustomToken(token: string) {
      signInCalls.push(token);
      if (opts?.signInImpl) {
        const session = await opts.signInImpl(token);
        currentUid = session.uid;
        resolution = { status: 'resolved', uid: session.uid };
        return session;
      }
      currentUid = 'li_synth_uid_001';
      resolution = { status: 'resolved', uid: 'li_synth_uid_001' };
      return { uid: 'li_synth_uid_001' };
    },
  };
}

function createSessionDeps(opts: {
  auth?: ReturnType<typeof createMockAuth>;
  browser?: LinkedInAuthBrowser;
  exchange?: Record<string, unknown> | (() => Promise<Record<string, unknown>>);
  exchangeDelay?: () => Promise<void>;
}): LinkedInSessionDeps & {
  calls: Array<{ name: string; data: unknown }>;
  auth: ReturnType<typeof createMockAuth>;
  kv: ReturnType<typeof createMemorySecureKv>;
} {
  const calls: Array<{ name: string; data: unknown }> = [];
  const kv = createMemorySecureKv();
  const store = createLinkedInTransactionStore(kv);
  const auth = opts.auth ?? createMockAuth();
  const browser: LinkedInAuthBrowser = opts.browser ?? {
    async openAuthSession() {
      return { type: 'success', url: successUrl() };
    },
  };

  return {
    calls,
    auth,
    kv,
    crypto: nodePkceCrypto(),
    store,
    appCheck: { ensureReady: async () => {} },
    browser,
    firebaseAuth: auth,
    functions: {
      region: 'us-central1',
      async call(name, data) {
        calls.push({ name, data });
        if (name === LINKEDIN_AUTH_START_CALLABLE) {
          return {
            transactionId: TX,
            authorizationUrl:
              'https://www.linkedin.com/oauth/v2/authorization?synthetic=1',
            expiresAt: Date.now() + 600_000,
          };
        }
        if (name === LINKEDIN_AUTH_EXCHANGE_CALLABLE) {
          if (opts.exchangeDelay) await opts.exchangeDelay();
          if (typeof opts.exchange === 'function') return opts.exchange();
          return opts.exchange ?? { customToken: SYNTH_TOKEN };
        }
        throw new Error('unexpected callable');
      },
    },
  };
}

beforeEach(() => {
  __resetLinkedInAuthClientLocksForTests();
  __resetLinkedInCoordinatorForTests();
  __resetLinkedInSessionForTests();
});

describe('linkedinFirebaseAuth adapter', () => {
  it('invokes signInWithCustomToken exactly once with the exact token', async () => {
    const auth = createMockAuth();
    const session = await signInWithLinkedInCustomToken(auth, SYNTH_TOKEN);
    assert.equal(auth.signInCalls.length, 1);
    assert.equal(auth.signInCalls[0], SYNTH_TOKEN);
    assert.equal(session.uid, 'li_synth_uid_001');
    assert.deepEqual(Object.keys(session), ['uid']);
  });

  it('does not call getIdToken', async () => {
    const auth = createMockAuth();
    await signInWithLinkedInCustomToken(auth, SYNTH_TOKEN);
    assert.equal(auth.getIdTokenCalls, 0);
  });

  it('sanitized errors never include the token', () => {
    const err = mapFirebaseCustomTokenError({
      code: 'auth/invalid-custom-token',
      message: `Token ${SYNTH_TOKEN} is bad`,
    });
    assert.equal(err.code, 'CUSTOM_TOKEN_INVALID');
    assert.ok(!err.message.includes(SYNTH_TOKEN));
  });

  it('maps documented Firebase codes', () => {
    assert.equal(
      mapFirebaseCustomTokenError({ code: 'auth/network-request-failed' }).code,
      'FIREBASE_NETWORK',
    );
    assert.equal(
      isUncertainFirebaseSignInError(
        mapFirebaseCustomTokenError({ code: 'auth/network-request-failed' }),
      ),
      true,
    );
    assert.equal(
      isTerminalFirebaseSignInError(
        mapFirebaseCustomTokenError({ code: 'auth/invalid-custom-token' }),
      ),
      true,
    );
  });
});

describe('authenticateWithLinkedInBrowser', () => {
  it('completes browser flow into Firebase session without returning token', async () => {
    const deps = createSessionDeps({});
    const result = await authenticateWithLinkedInBrowser(deps);
    assert.equal(result.status, 'authenticated');
    if (result.status === 'authenticated') {
      assert.ok(!('customToken' in result.session));
    }
    assert.equal(deps.auth.signInCalls.length, 1);
    assert.equal(await deps.kv.getItem(LINKEDIN_TX_STORAGE_KEY), null);
  });

  it('does not reach Firebase Auth on cancel', async () => {
    const deps = createSessionDeps({
      browser: { async openAuthSession() { return { type: 'cancel' }; } },
    });
    const result = await authenticateWithLinkedInBrowser(deps);
    assert.equal(result.status, 'cancelled');
    assert.equal(deps.auth.signInCalls.length, 0);
  });

  it('session already active avoids Start', async () => {
    const auth = createMockAuth({ initialUid: 'existing_uid' });
    const deps = createSessionDeps({ auth });
    const result = await authenticateWithLinkedInBrowser(deps);
    assert.equal(result.status, 'session_already_active');
    assert.equal(deps.calls.length, 0);
  });

  it('session appearing during Exchange avoids silent replace', async () => {
    const auth = createMockAuth();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const deps = createSessionDeps({
      auth,
      exchangeDelay: async () => {
        auth.setCurrentUid('other_provider_uid');
        await gate;
      },
    });
    const p = authenticateWithLinkedInBrowser(deps);
    await new Promise((r) => setTimeout(r, 30));
    release();
    assert.equal((await p).status, 'session_changed_during_flow');
    assert.equal(auth.signInCalls.length, 0);
  });

  it('Firebase terminal failure does not re-Exchange', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/invalid-custom-token' };
      },
    });
    const deps = createSessionDeps({ auth });
    const result = await authenticateWithLinkedInBrowser(deps);
    assert.equal(result.status, 'failed');
    assert.equal(auth.signInCalls.length, 1);
    assert.equal(
      deps.calls.filter((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE)
        .length,
      1,
    );
  });

  it('two concurrent session entry points produce one sign-in', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const auth = createMockAuth({
      signInImpl: async () => {
        await gate;
        return { uid: 'li_synth_uid_001' };
      },
    });
    const deps = createSessionDeps({ auth });
    const p1 = authenticateWithLinkedInBrowser(deps);
    await new Promise((r) => setTimeout(r, 20));
    const p2 = await authenticateWithLinkedInBrowser(deps);
    assert.equal(p2.status, 'failed');
    release();
    assert.equal((await p1).status, 'authenticated');
    assert.equal(auth.signInCalls.length, 1);
  });

  it('releases session lock after Firebase exception', async () => {
    const failing = createSessionDeps({
      auth: createMockAuth({
        signInImpl: async () => {
          throw { code: 'auth/invalid-custom-token' };
        },
      }),
    });
    assert.equal((await authenticateWithLinkedInBrowser(failing)).status, 'failed');
    __resetLinkedInCoordinatorForTests();
    __resetLinkedInAuthClientLocksForTests();
    assert.equal(
      (await authenticateWithLinkedInBrowser(createSessionDeps({}))).status,
      'authenticated',
    );
  });
});

describe('uncertain Firebase reconciliation barrier', () => {
  it('network failure sets barrier and blocks new OAuth without token', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/network-request-failed' };
      },
    });
    const deps = createSessionDeps({ auth });
    const result = await authenticateWithLinkedInBrowser(deps);
    assert.equal(result.status, 'uncertain');
    assert.ok(!JSON.stringify(result).includes(SYNTH_TOKEN));
    assert.ok(getLinkedInFirebaseUncertainBarrier());

    __resetLinkedInCoordinatorForTests();
    __resetLinkedInAuthClientLocksForTests();
    const blocked = await authenticateWithLinkedInBrowser(createSessionDeps({}));
    assert.equal(blocked.status, 'failed');
    if (blocked.status === 'failed') {
      assert.equal(blocked.error.code, 'FIREBASE_UNCERTAIN_PENDING');
    }
  });

  it('reconcile before Auth readiness returns pending and keeps barrier', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/network-request-failed' };
      },
    });
    await authenticateWithLinkedInBrowser(createSessionDeps({ auth }));
    auth.setAuthResolution({ status: 'pending' });
    const pending = reconcileLinkedInFirebaseUncertainState(auth);
    assert.equal(pending.status, 'pending');
    assert.ok(getLinkedInFirebaseUncertainBarrier());
  });

  it('null currentUser while pending does not clear barrier', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/network-request-failed' };
      },
    });
    await authenticateWithLinkedInBrowser(createSessionDeps({ auth }));
    auth.setCurrentUid(null);
    auth.setAuthResolution({ status: 'pending' });
    assert.equal(reconcileLinkedInFirebaseUncertainState(auth).status, 'pending');
    assert.ok(getLinkedInFirebaseUncertainBarrier());
  });

  it('Auth resolved with user returns authenticated and clears barrier', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/network-request-failed' };
      },
    });
    await authenticateWithLinkedInBrowser(createSessionDeps({ auth }));
    auth.setAuthResolution({ status: 'resolved', uid: 'li_synth_uid_001' });
    const r = reconcileLinkedInFirebaseUncertainState(auth);
    assert.equal(r.status, 'authenticated');
    assert.equal(getLinkedInFirebaseUncertainBarrier(), null);
  });

  it('Auth resolved without user returns cleared and allows new OAuth', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/internal-error' };
      },
    });
    await authenticateWithLinkedInBrowser(createSessionDeps({ auth }));
    auth.setAuthResolution({ status: 'resolved', uid: null });
    assert.equal(reconcileLinkedInFirebaseUncertainState(auth).status, 'cleared');
    assert.equal(getLinkedInFirebaseUncertainBarrier(), null);

    __resetLinkedInCoordinatorForTests();
    __resetLinkedInAuthClientLocksForTests();
    assert.equal(
      (await authenticateWithLinkedInBrowser(createSessionDeps({}))).status,
      'authenticated',
    );
  });

  it('resolution probe exception keeps barrier as pending', async () => {
    const auth = createMockAuth({
      signInImpl: async () => {
        throw { code: 'auth/network-request-failed' };
      },
    });
    const result = await authenticateWithLinkedInBrowser(
      createSessionDeps({ auth }),
    );
    assert.equal(result.status, 'uncertain');
    auth.setResolutionThrows(true);
    assert.equal(reconcileLinkedInFirebaseUncertainState(auth).status, 'pending');
    assert.ok(getLinkedInFirebaseUncertainBarrier());
  });

  it('entry point refuses Start while Auth resolution is pending', async () => {
    const auth = createMockAuth({ authResolution: { status: 'pending' } });
    const deps = createSessionDeps({ auth });
    const result = await authenticateWithLinkedInBrowser(deps);
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.error.code, 'FIREBASE_AUTH_NOT_READY');
    }
    assert.equal(deps.calls.length, 0);
  });
});

describe('authenticateWithLinkedInColdStartClaim', () => {
  it('exchanges then signs in without leaving a pending token', async () => {
    const deps = createSessionDeps({});
    await linkedInAuthStart(deps);
    const claim = {
      transactionId: TX,
      fingerprint: expectedLinkedInSuccessFingerprint(TX),
    };
    assertLinkedInPendingExchangeClaim(claim);
    const result = await authenticateWithLinkedInColdStartClaim(deps, claim);
    assert.equal(result.status, 'authenticated');
    assert.equal(await deps.kv.getItem(LINKEDIN_TX_STORAGE_KEY), null);
  });

  it('rejects wrong fingerprint with correct transactionId', async () => {
    const deps = createSessionDeps({});
    await linkedInAuthStart(deps);
    const result = await authenticateWithLinkedInColdStartClaim(deps, {
      transactionId: TX,
      fingerprint: 'ok:tx_other_zzzzzzzzzzzz',
    });
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.error.code, 'CALLBACK_MISMATCH');
    }
  });

  it('existing session avoids Exchange', async () => {
    const auth = createMockAuth({ initialUid: 'existing_uid' });
    const deps = createSessionDeps({ auth });
    await linkedInAuthStart(deps);
    const result = await authenticateWithLinkedInColdStartClaim(deps, {
      transactionId: TX,
      fingerprint: expectedLinkedInSuccessFingerprint(TX),
    });
    assert.equal(result.status, 'session_already_active');
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
  });
});

describe('import and App.tsx wiring absence', () => {
  it('importing session modules has no side effects', async () => {
    await import('../linkedinFirebaseAuth.ts');
    await import('../linkedinSession.ts');
  });

  it('App.tsx has no LinkedIn session wiring', async () => {
    const fs = await import('node:fs/promises');
    const app = await fs.readFile(
      new URL('../../../App.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(/linkedin|LinkedIn|signInWithCustomToken/i.test(app), false);
  });
});
