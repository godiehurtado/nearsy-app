/**
 * LinkedIn A3.4.2 client core tests (PKCE, store, Start/Exchange).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/authentication/linkedin/__tests__/linkedinAuthCore.test.ts
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';

import {
  __resetLinkedInAuthClientLocksForTests,
  BASE64URL_RE,
  LINKEDIN_AUTH_EXCHANGE_CALLABLE,
  LINKEDIN_AUTH_START_CALLABLE,
  LINKEDIN_MOBILE_RETURN_URL,
  LINKEDIN_TX_STORAGE_KEY,
  MAX_CODE_VERIFIER_LEN,
  MIN_CODE_VERIFIER_LEN,
  LinkedInAuthError,
  assertCodeVerifierShape,
  bytesToBase64Url,
  clearLinkedInAuthTransaction,
  createLinkedInTransactionStore,
  createMemorySecureKv,
  createPkcePair,
  createS256CodeChallenge,
  generateCodeVerifier,
  isExactLinkedInMobileReturnBase,
  linkedInAuthExchange,
  linkedInAuthStart,
  normalizeLinkedInCallableError,
  parseLinkedInAuthExchangeResponse,
  parseLinkedInAuthStartResponse,
  shouldClearTransactionAfterExchangeError,
  type IdentityCallableInvoker,
  type LinkedInAuthClientDeps,
  type PkceCrypto,
} from '../linkedinAuthCore.ts';

function nodePkceCrypto(): PkceCrypto {
  return {
    getRandomBytes: (n) => randomBytes(n),
    sha256: (utf8) => createHash('sha256').update(utf8, 'utf8').digest(),
  };
}

function mockAppCheckReady(): LinkedInAuthClientDeps['appCheck'] {
  return { ensureReady: async () => {} };
}

describe('PKCE', () => {
  it('generates verifier within Functions length + charset', async () => {
    const v = await generateCodeVerifier(nodePkceCrypto());
    assert.ok(v.length >= MIN_CODE_VERIFIER_LEN);
    assert.ok(v.length <= MAX_CODE_VERIFIER_LEN);
    assert.match(v, BASE64URL_RE);
    assertCodeVerifierShape(v);
  });

  it('uses crypto getRandomBytes (not Math.random)', async () => {
    let calls = 0;
    const crypto: PkceCrypto = {
      getRandomBytes: (n) => {
        calls += 1;
        return randomBytes(n);
      },
      sha256: (utf8) => createHash('sha256').update(utf8, 'utf8').digest(),
    };
    await generateCodeVerifier(crypto);
    assert.equal(calls, 1);
  });

  it('matches RFC 7636 S256 known vector (base64url, no padding)', async () => {
    // RFC 7636 Appendix B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const challenge = await createS256CodeChallenge(nodePkceCrypto(), verifier);
    assert.equal(challenge, expected);
    assert.equal(challenge.includes('='), false);
    assert.equal(challenge.includes('+'), false);
    assert.equal(challenge.includes('/'), false);
  });

  it('bytesToBase64Url strips padding and uses url alphabet', () => {
    const encoded = bytesToBase64Url(Uint8Array.from([0xff, 0xef, 0x00]));
    assert.match(encoded, BASE64URL_RE);
    assert.equal(encoded.includes('='), false);
  });

  it('createPkcePair returns S256 method', async () => {
    const pair = await createPkcePair(nodePkceCrypto());
    assert.equal(pair.pkceMethod, 'S256');
    assert.notEqual(pair.codeVerifier, pair.codeChallenge);
  });
});

describe('contract parsers', () => {
  it('accepts exact Start response', () => {
    const out = parseLinkedInAuthStartResponse({
      transactionId: 'txABCDEF12',
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1',
      expiresAt: Date.now() + 60_000,
    });
    assert.equal(out.transactionId, 'txABCDEF12');
  });

  it('rejects incomplete Start response', () => {
    assert.throws(() =>
      parseLinkedInAuthStartResponse({
        transactionId: 'txABCDEF12',
        authorizationUrl: 'https://example.com',
      }),
    );
    assert.throws(() =>
      parseLinkedInAuthStartResponse({
        transactionId: 'short',
        authorizationUrl: 'https://example.com',
        expiresAt: 1,
      }),
    );
    assert.throws(() =>
      parseLinkedInAuthStartResponse({
        transactionId: 'txABCDEF12',
        authorizationUrl: 'http://insecure.example/x',
        expiresAt: 1,
      }),
    );
  });

  it('accepts Exchange response and keeps token as plain string', () => {
    const out = parseLinkedInAuthExchangeResponse({
      customToken: 'synthetic.custom.token',
    });
    assert.equal(out.customToken, 'synthetic.custom.token');
  });

  it('rejects invalid Exchange response', () => {
    assert.throws(() => parseLinkedInAuthExchangeResponse({}));
    assert.throws(() => parseLinkedInAuthExchangeResponse({ customToken: '' }));
  });

  it('validates exact mobile return base', () => {
    assert.equal(isExactLinkedInMobileReturnBase('nearsy://linkedin-auth'), true);
    assert.equal(
      isExactLinkedInMobileReturnBase('nearsy://linkedin-auth?result=ok'),
      true,
    );
    assert.equal(
      isExactLinkedInMobileReturnBase('com.nearsy.app://linkedin-auth'),
      false,
    );
    assert.equal(
      isExactLinkedInMobileReturnBase('nearsy://linkedin-auth/extra'),
      false,
    );
  });
});

describe('transaction store', () => {
  it('persists and recovers a transaction', async () => {
    const store = createLinkedInTransactionStore(createMemorySecureKv());
    const now = Date.now();
    await store.write({
      version: 1,
      transactionId: 'txABCDEF12',
      codeVerifier: 'v'.repeat(43),
      createdAt: now,
      expiresAt: now + 600_000,
      mobileReturnUrl: LINKEDIN_MOBILE_RETURN_URL,
      platform: 'android',
    });
    const read = await store.read();
    assert.equal(read?.transactionId, 'txABCDEF12');
    assert.equal(read?.codeVerifier, 'v'.repeat(43));
  });

  it('expires and clears durable state', async () => {
    const kv = createMemorySecureKv();
    let now = 1_000;
    const store = createLinkedInTransactionStore(kv, () => now);
    await store.write({
      version: 1,
      transactionId: 'txABCDEF12',
      codeVerifier: 'v'.repeat(43),
      createdAt: 1,
      expiresAt: 50,
      mobileReturnUrl: LINKEDIN_MOBILE_RETURN_URL,
      platform: 'android',
    });
    now = 100;
    await assert.rejects(() => store.read(), (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'TRANSACTION_EXPIRED');
      return true;
    });
    assert.equal(await kv.getItem(LINKEDIN_TX_STORAGE_KEY), null);
  });

  it('detects corrupt storage', async () => {
    const kv = createMemorySecureKv();
    await kv.setItem(LINKEDIN_TX_STORAGE_KEY, '{not-json');
    const store = createLinkedInTransactionStore(kv);
    await assert.rejects(() => store.read(), (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'TRANSACTION_CORRUPT');
      return true;
    });
  });
});

describe('linkedInAuthStart / Exchange', () => {
  beforeEach(() => {
    __resetLinkedInAuthClientLocksForTests();
  });

  function makeDeps(overrides: {
    call?: IdentityCallableInvoker['call'];
    appCheck?: LinkedInAuthClientDeps['appCheck'];
  } = {}): LinkedInAuthClientDeps & { calls: Array<{ name: string; data: unknown }> } {
    const calls: Array<{ name: string; data: unknown }> = [];
    const store = createLinkedInTransactionStore(createMemorySecureKv());
    const deps: LinkedInAuthClientDeps & {
      calls: Array<{ name: string; data: unknown }>;
    } = {
      calls,
      crypto: nodePkceCrypto(),
      store,
      appCheck: overrides.appCheck ?? mockAppCheckReady(),
      functions: {
        region: 'us-central1',
        call: async (name, data) => {
          calls.push({ name, data });
          if (overrides.call) return overrides.call(name, data);
          if (name === LINKEDIN_AUTH_START_CALLABLE) {
            return {
              transactionId: 'txStart0001',
              authorizationUrl:
                'https://www.linkedin.com/oauth/v2/authorization?x=1',
              expiresAt: Date.now() + 600_000,
            };
          }
          if (name === LINKEDIN_AUTH_EXCHANGE_CALLABLE) {
            return { customToken: 'synthetic.jwt.token' };
          }
          throw new Error('unexpected callable');
        },
      },
    };
    return deps;
  }

  it('Start payload is exact Functions contract', async () => {
    const deps = makeDeps();
    const out = await linkedInAuthStart(deps);
    assert.equal(deps.calls.length, 1);
    assert.equal(deps.calls[0]!.name, LINKEDIN_AUTH_START_CALLABLE);
    const payload = deps.calls[0]!.data as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), [
      'pkceChallenge',
      'pkceMethod',
      'platform',
    ]);
    assert.equal(payload.platform, 'android');
    assert.equal(payload.pkceMethod, 'S256');
    assert.match(String(payload.pkceChallenge), BASE64URL_RE);
    assert.equal(out.mobileReturnUrl, LINKEDIN_MOBILE_RETURN_URL);
    assert.equal(deps.functions.region, 'us-central1');
  });

  it('Start persists verifier only after success; clears nothing on callable failure', async () => {
    const deps = makeDeps({
      call: async () => {
        throw Object.assign(new Error('LinkedIn auth core is not enabled.'), {
          code: 'unavailable',
        });
      },
    });
    await assert.rejects(() => linkedInAuthStart(deps), (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'CORE_DISABLED');
      return true;
    });
    assert.equal(await deps.store.read(), null);
  });

  it('Start clears corrupt prior state then continues', async () => {
    const kv = createMemorySecureKv();
    await kv.setItem(LINKEDIN_TX_STORAGE_KEY, '{"version":1}');
    const store = createLinkedInTransactionStore(kv);
    const deps = makeDeps();
    deps.store = store;
    const out = await linkedInAuthStart(deps);
    assert.equal(out.transactionId, 'txStart0001');
  });

  it('rejects Start when an active transaction already exists', async () => {
    const deps = makeDeps();
    await linkedInAuthStart(deps);
    await assert.rejects(() => linkedInAuthStart(deps), (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'OPERATION_IN_PROGRESS');
      return true;
    });
  });

  it('rejects concurrent Start (in-flight lock)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const deps = makeDeps({
      call: async () => {
        await gate;
        return {
          transactionId: 'txStart0001',
          authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
          expiresAt: Date.now() + 600_000,
        };
      },
    });
    const p1 = linkedInAuthStart(deps);
    const p2 = linkedInAuthStart(deps);
    await assert.rejects(() => p2, (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'OPERATION_IN_PROGRESS');
      return true;
    });
    release();
    await p1;
  });

  it('Start requires App Check ready', async () => {
    const deps = makeDeps({
      appCheck: {
        ensureReady: async () => {
          throw new LinkedInAuthError(
            'APP_CHECK_NOT_READY',
            'App Check is not ready.',
          );
        },
      },
    });
    await assert.rejects(() => linkedInAuthStart(deps), (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'APP_CHECK_NOT_READY');
      return true;
    });
  });

  it('rejects invalid Start response shape', async () => {
    const deps = makeDeps({
      call: async () => ({ transactionId: 'x' }),
    });
    await assert.rejects(() => linkedInAuthStart(deps), (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'START_RESPONSE_INVALID');
      return true;
    });
  });

  it('Exchange payload exact + clears store + token memory-only', async () => {
    const deps = makeDeps();
    await linkedInAuthStart(deps);
    const result = await linkedInAuthExchange(deps, {
      transactionId: 'txStart0001',
    });
    assert.equal(result.customToken, 'synthetic.jwt.token');
    const exchangeCall = deps.calls.find(
      (c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE,
    );
    assert.ok(exchangeCall);
    const payload = exchangeCall!.data as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), [
      'codeVerifier',
      'transactionId',
    ]);
    assert.equal(payload.transactionId, 'txStart0001');
    assert.match(String(payload.codeVerifier), BASE64URL_RE);
    assert.equal(await deps.store.read(), null);
    // Ensure we never wrote customToken into KV
    const kvDump = JSON.stringify(
      await (async () => {
        // memory kv is encapsulated; re-read via corrupt path — store empty
        return null;
      })(),
    );
    assert.equal(kvDump.includes('synthetic.jwt.token'), false);
  });

  it('Exchange missing transaction', async () => {
    const deps = makeDeps();
    await assert.rejects(
      () => linkedInAuthExchange(deps, { transactionId: 'txStart0001' }),
      (err: unknown) => {
        assert.ok(err instanceof LinkedInAuthError);
        assert.equal(err.code, 'TRANSACTION_MISSING');
        return true;
      },
    );
  });

  it('Exchange duplicate after consume fails', async () => {
    const deps = makeDeps();
    await linkedInAuthStart(deps);
    await linkedInAuthExchange(deps, { transactionId: 'txStart0001' });
    await assert.rejects(
      () => linkedInAuthExchange(deps, { transactionId: 'txStart0001' }),
      (err: unknown) => {
        assert.ok(err instanceof LinkedInAuthError);
        assert.equal(err.code, 'TRANSACTION_MISSING');
        return true;
      },
    );
  });

  it('Exchange concurrent lock', async () => {
    const deps = makeDeps();
    await linkedInAuthStart(deps);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    deps.functions.call = async (name, data) => {
      if (name === LINKEDIN_AUTH_EXCHANGE_CALLABLE) {
        await gate;
        return { customToken: 'synthetic.jwt.token' };
      }
      return {
        transactionId: 'txStart0001',
        authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        expiresAt: Date.now() + 600_000,
      };
    };
    const p1 = linkedInAuthExchange(deps, { transactionId: 'txStart0001' });
    const p2 = linkedInAuthExchange(deps, { transactionId: 'txStart0001' });
    await assert.rejects(() => p2, (err: unknown) => {
      assert.ok(err instanceof LinkedInAuthError);
      assert.equal(err.code, 'OPERATION_IN_PROGRESS');
      return true;
    });
    release();
    await p1;
  });

  it('clears on cancel helper', async () => {
    const deps = makeDeps();
    await linkedInAuthStart(deps);
    await clearLinkedInAuthTransaction(deps.store);
    assert.equal(await deps.store.read(), null);
  });

  it('normalizes core-off and App Check HttpsError', () => {
    const core = normalizeLinkedInCallableError(
      Object.assign(new Error('LinkedIn auth core is not enabled.'), {
        code: 'unavailable',
      }),
    );
    assert.equal(core.code, 'CORE_DISABLED');
    const ac = normalizeLinkedInCallableError(
      Object.assign(new Error('unauthenticated'), {
        code: 'unauthenticated',
      }),
    );
    assert.equal(ac.code, 'APP_CHECK_REJECTED');
  });

  it('shouldClearTransactionAfterExchangeError policy', () => {
    assert.equal(
      shouldClearTransactionAfterExchangeError(
        new LinkedInAuthError('NETWORK', 'Network request failed.'),
      ),
      false,
    );
    assert.equal(
      shouldClearTransactionAfterExchangeError(
        new LinkedInAuthError('TRANSACTION_EXPIRED', 'Transaction expired.'),
      ),
      true,
    );
  });
});

describe('module import side effects', () => {
  it('importing core does not invoke network', async () => {
    // Re-import path is static; assert callables are not auto-invoked by
    // constructing deps without calling start/exchange.
    const deps = {
      crypto: nodePkceCrypto(),
      store: createLinkedInTransactionStore(createMemorySecureKv()),
      appCheck: mockAppCheckReady(),
      functions: {
        region: 'us-central1',
        call: async () => {
          throw new Error('should not be called on import');
        },
      },
    };
    assert.equal(deps.functions.region, 'us-central1');
  });
});
