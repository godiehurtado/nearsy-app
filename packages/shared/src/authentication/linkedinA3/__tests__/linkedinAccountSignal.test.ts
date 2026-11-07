/**
 * Additive Exchange signal (accountOutcome + authCreationTimeMs): strict parsing
 * and propagation through the live flow and durable resume, with fixtures.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it } from 'node:test';

import {
  decideLinkedInSignup,
  matchesFirebaseCreationTime,
  readLinkedInAccountSignal,
} from '../accountCreationSignal';
import { createAppCheckBootstrap } from '../appCheck/appCheckBootstrap';
import { mapExpoAuthSessionResult } from '../browserSession';
import { createClientProofPair, type ClientProofCrypto } from '../clientProof';
import {
  clearLinkedInA3ResumeStateForTests,
  resumeLinkedInA3FromReturnUrl,
} from '../durableResume';
import { createInMemoryLinkedInA3DurableStore } from '../durableTransactionStore';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';
import { createLinkedInA3CallableClient } from '../functions/linkedInA3CallableClient';
import {
  clearLinkedInA3OrchestratorStateForTests,
  runLinkedInA3BrowserAuthFlow,
} from '../orchestrator';
import { assertLinkedInAuthExchangeResult } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

const nodeCrypto: ClientProofCrypto = {
  getRandomBytes: (n) => randomBytes(n),
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest(),
};
const TX = 'AbcdefghijkLmnoPqrsTuv';
const CUSTOM_TOKEN = 'custom-token-value-long-enough';
const SUCCESS_URL = `nearsy://linkedin-auth?transactionId=${TX}&result=ok`;

/** Firebase `metadata.creationTime` is an HTTP date: whole seconds. */
const FIREBASE_CREATION = 'Mon, 02 Nov 2026 10:00:00 GMT';
const CREATED_MS = Date.parse(FIREBASE_CREATION) + 437;

const FIXTURES = {
  created: { customToken: CUSTOM_TOKEN, accountOutcome: 'created', authCreationTimeMs: CREATED_MS },
  existing: { customToken: CUSTOM_TOKEN, accountOutcome: 'existing', authCreationTimeMs: CREATED_MS },
  old: { customToken: CUSTOM_TOKEN },
  outcomeOnly: { customToken: CUSTOM_TOKEN, accountOutcome: 'created' },
  timeOnly: { customToken: CUSTOM_TOKEN, authCreationTimeMs: CREATED_MS },
} as const;

async function readyClient(exchangeData: unknown, calls: { exchange: number }) {
  const appCheck = createAppCheckBootstrap({
    port: { async initialize() {}, async ensureToken() {} },
    maxAttempts: 1,
  });
  await appCheck.initialize();
  return createLinkedInA3CallableClient({
    environment: resolveNearsyFirebaseEnvironment('development'),
    appCheck,
    getNativeProjectId: () => 'nearsy-dev',
    getJsProjectId: () => 'nearsy-dev',
    invoke: async (name) => {
      if (name === 'linkedinAuthStart') {
        return {
          transactionId: TX,
          authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1',
          expiresAt: Date.now() + 600_000,
        };
      }
      calls.exchange += 1;
      return exchangeData;
    },
  });
}

describe('accountOutcome + authCreationTimeMs parsing', () => {
  it('keeps the pair only when both are valid', () => {
    assert.deepEqual(readLinkedInAccountSignal(FIXTURES.created), {
      accountOutcome: 'created',
      authCreationTimeMs: CREATED_MS,
    });
    assert.deepEqual(readLinkedInAccountSignal(FIXTURES.existing)?.accountOutcome, 'existing');
    for (const fixture of [FIXTURES.old, FIXTURES.outcomeOnly, FIXTURES.timeOnly]) {
      assert.equal(readLinkedInAccountSignal(fixture), null);
    }
  });

  it('rejects malformed values', () => {
    for (const [accountOutcome, authCreationTimeMs] of [
      ['CREATED', CREATED_MS],
      ['new', CREATED_MS],
      [true, CREATED_MS],
      ['created', String(CREATED_MS)],
      ['created', CREATED_MS + 0.5],
      ['created', 0],
      ['created', -1],
      ['created', Number.NaN],
      ['created', Number.MAX_SAFE_INTEGER + 2],
      ['created', null],
    ] as const) {
      assert.equal(
        readLinkedInAccountSignal({ accountOutcome, authCreationTimeMs }),
        null,
        `${String(accountOutcome)} ${String(authCreationTimeMs)}`,
      );
    }
  });

  it('Exchange parsing: old and malformed responses still sign in', () => {
    assert.deepEqual(assertLinkedInAuthExchangeResult(FIXTURES.old), { customToken: CUSTOM_TOKEN });
    assert.deepEqual(assertLinkedInAuthExchangeResult(FIXTURES.outcomeOnly), {
      customToken: CUSTOM_TOKEN,
    });
    assert.deepEqual(assertLinkedInAuthExchangeResult(FIXTURES.created).accountSignal, {
      accountOutcome: 'created',
      authCreationTimeMs: CREATED_MS,
    });
  });
});

describe('generation match at Firebase precision', () => {
  it('an HTTP date compares by whole second, with no window', () => {
    const base = Date.parse(FIREBASE_CREATION);
    assert.equal(matchesFirebaseCreationTime(base, FIREBASE_CREATION), true);
    assert.equal(matchesFirebaseCreationTime(base + 999, FIREBASE_CREATION), true);
    assert.equal(matchesFirebaseCreationTime(base + 1000, FIREBASE_CREATION), false);
    assert.equal(matchesFirebaseCreationTime(base - 1, FIREBASE_CREATION), false);
  });

  it('a value with milliseconds compares exactly', () => {
    const iso = '2026-11-02T10:00:00.437Z';
    assert.equal(matchesFirebaseCreationTime(Date.parse(iso), iso), true);
    assert.equal(matchesFirebaseCreationTime(Date.parse(iso) + 1, iso), false);
  });

  it('no Firebase date means no match', () => {
    assert.equal(matchesFirebaseCreationTime(CREATED_MS, null), false);
    assert.equal(matchesFirebaseCreationTime(CREATED_MS, 'not a date'), false);
  });

  it('decision', () => {
    const created = readLinkedInAccountSignal(FIXTURES.created);
    const existing = readLinkedInAccountSignal(FIXTURES.existing);
    assert.equal(decideLinkedInSignup(created, FIREBASE_CREATION), 'emit');
    assert.equal(decideLinkedInSignup(existing, FIREBASE_CREATION), 'existing');
    assert.equal(decideLinkedInSignup(null, FIREBASE_CREATION), 'no_signal');
    assert.equal(
      decideLinkedInSignup(created, 'Fri, 06 Nov 2026 10:00:00 GMT'),
      'generation_mismatch',
    );
  });
});

describe('propagation through the live flow', () => {
  beforeEach(() => clearLinkedInA3OrchestratorStateForTests());

  async function run(exchangeData: unknown) {
    const calls = { exchange: 0 };
    const client = await readyClient(exchangeData, calls);
    const result = await runLinkedInA3BrowserAuthFlow({
      platform: 'ios',
      crypto: nodeCrypto,
      browser: {
        openAuthSession: async () =>
          mapExpoAuthSessionResult({ type: 'success', url: SUCCESS_URL }),
      },
      getClient: async () => client,
      auth: {
        getCurrentUid: () => null,
        signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
      },
    });
    return { result, calls };
  }

  it('created reaches the authenticated result, with one Exchange', async () => {
    const { result, calls } = await run(FIXTURES.created);
    assert.equal(result.status, 'authenticated');
    assert.equal(calls.exchange, 1);
    if (result.status === 'authenticated') {
      assert.deepEqual(result.accountSignal, {
        accountOutcome: 'created',
        authCreationTimeMs: CREATED_MS,
      });
    }
  });

  it('an old or incomplete response signs in without a signal', async () => {
    for (const fixture of [FIXTURES.old, FIXTURES.outcomeOnly, FIXTURES.timeOnly]) {
      clearLinkedInA3OrchestratorStateForTests();
      const { result, calls } = await run(fixture);
      assert.equal(result.status, 'authenticated');
      assert.equal(calls.exchange, 1);
      if (result.status === 'authenticated') assert.equal('accountSignal' in result, false);
    }
  });
});

describe('propagation through durable resume', () => {
  beforeEach(() => clearLinkedInA3ResumeStateForTests());

  async function persisted() {
    const store = createInMemoryLinkedInA3DurableStore();
    const pair = await createClientProofPair(nodeCrypto);
    await store.save({
      transactionId: TX,
      clientProofVerifier: pair.clientProofVerifier,
      expiresAt: Date.now() + 600_000,
      startedAt: Date.now(),
    });
    return store;
  }

  it('created reaches the resumed result, and a repeated callback does not Exchange again', async () => {
    const store = await persisted();
    const calls = { exchange: 0 };
    const client = await readyClient(FIXTURES.created, calls);
    const deps = {
      durableStore: store,
      getClient: async () => client,
      auth: {
        getCurrentUid: () => null,
        signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
      },
    };
    const first = await resumeLinkedInA3FromReturnUrl(SUCCESS_URL, deps);
    const second = await resumeLinkedInA3FromReturnUrl(SUCCESS_URL, deps);
    assert.equal(first.status, 'authenticated');
    if (first.status === 'authenticated') {
      assert.equal(first.accountSignal?.accountOutcome, 'created');
      assert.equal(first.accountSignal?.authCreationTimeMs, CREATED_MS);
    }
    assert.equal(second.status, 'skipped');
    assert.equal(calls.exchange, 1);
  });

  it('existing and old responses resume without a creation signal', async () => {
    for (const fixture of [FIXTURES.existing, FIXTURES.old]) {
      clearLinkedInA3ResumeStateForTests();
      const store = await persisted();
      const calls = { exchange: 0 };
      const client = await readyClient(fixture, calls);
      const result = await resumeLinkedInA3FromReturnUrl(SUCCESS_URL, {
        durableStore: store,
        getClient: async () => client,
        auth: {
          getCurrentUid: () => null,
          signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
        },
      });
      assert.equal(result.status, 'authenticated');
      if (result.status === 'authenticated') {
        assert.notEqual(result.accountSignal?.accountOutcome, 'created');
      }
    }
  });
});

describe('wiring to the authenticated session', () => {
  it('live sign-in and resume both hand the signal to the finalizer', () => {
    const auth = read('authenticateWithLinkedIn.ts');
    assert.match(auth, /accountSignal: flow\.accountSignal,/);
    assert.match(auth, /trackLinkedInAuthSession\(uid, input\.accountSignal \?\? null\)/);
    const reload = auth.indexOf('await firebaseAuth.currentUser.reload()');
    const track = auth.indexOf('trackLinkedInAuthSession(uid');
    assert.ok(reload > 0 && track > reload, 'compared after the Auth reload');
    const app = readFileSync(join(here, '../../../App.tsx'), 'utf8');
    assert.match(app, /accountSignal: result\.accountSignal,/);
  });
});
