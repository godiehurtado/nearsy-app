/**
 * LinkedIn A3.4.3 browser + deep-link tests (no real browser / network / Firebase).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/authentication/linkedin/__tests__/linkedinDeepLinkAndBrowser.test.ts
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';

import {
  __resetLinkedInAuthClientLocksForTests,
  LINKEDIN_AUTH_EXCHANGE_CALLABLE,
  LINKEDIN_AUTH_START_CALLABLE,
  LINKEDIN_MOBILE_RETURN_URL,
  LinkedInAuthError,
  createLinkedInTransactionStore,
  createMemorySecureKv,
  linkedInAuthStart,
  type LinkedInAuthClientDeps,
  type ClientProofCrypto,
} from '../linkedinAuthCore.ts';
import {
  parseLinkedInMobileReturnUrl,
  parseStrictQuery,
  linkedInReturnFingerprint,
} from '../linkedinDeepLinkParser.ts';
import {
  mapExpoAuthSessionResult,
  type LinkedInAuthBrowser,
} from '../linkedinBrowserSession.ts';
import {
  __resetLinkedInCoordinatorForTests,
  discardLinkedInAuthTransaction,
  handleLinkedInReturnUrl,
  inspectInitialLinkedInReturn,
  runLinkedInBrowserAuthFlow,
  subscribeLinkedInReturnUrls,
  type LinkedInCoordinatorDeps,
  type LinkedInLinkingPort,
} from '../linkedinAuthCoordinator.ts';

const TX = 'tx_synth_abcdef012345';
const VERIFIER =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

function nodeClientProofCrypto(): ClientProofCrypto {
  return {
    getRandomBytes: (n) => randomBytes(n),
    sha256: (utf8) => createHash('sha256').update(utf8, 'utf8').digest(),
  };
}

function successUrl(tx = TX): string {
  return `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=${tx}&result=ok`;
}

function errorUrl(code: string, tx?: string): string {
  if (tx) {
    return `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=${tx}&result=error&error=${code}`;
  }
  return `${LINKEDIN_MOBILE_RETURN_URL}?result=error&error=${code}`;
}

function createDeps(opts: {
  start?: Record<string, unknown>;
  exchange?: Record<string, unknown> | (() => Promise<Record<string, unknown>>);
  startFail?: unknown;
  browser?: LinkedInAuthBrowser;
  linking?: LinkedInLinkingPort;
}): LinkedInCoordinatorDeps & {
  calls: Array<{ name: string; data: unknown }>;
  opened: string[];
} {
  const calls: Array<{ name: string; data: unknown }> = [];
  const opened: string[] = [];
  const store = createLinkedInTransactionStore(createMemorySecureKv());

  const browser: LinkedInAuthBrowser = opts.browser ?? {
    async openAuthSession(authorizationUrl) {
      opened.push(authorizationUrl);
      return { type: 'success', url: successUrl() };
    },
  };

  return {
    calls,
    opened,
    crypto: nodeClientProofCrypto(),
    store,
    appCheck: { ensureReady: async () => {} },
    browser,
    linking: opts.linking,
    functions: {
      region: 'us-central1',
      async call(name, data) {
        calls.push({ name, data });
        if (name === LINKEDIN_AUTH_START_CALLABLE) {
          if (opts.startFail) throw opts.startFail;
          return (
            opts.start ?? {
              transactionId: TX,
              authorizationUrl:
                'https://www.linkedin.com/oauth/v2/authorization?synthetic=1',
              expiresAt: Date.now() + 600_000,
            }
          );
        }
        if (name === LINKEDIN_AUTH_EXCHANGE_CALLABLE) {
          if (typeof opts.exchange === 'function') {
            return opts.exchange();
          }
          return opts.exchange ?? { customToken: 'synth.custom.token' };
        }
        throw new Error('unexpected callable');
      },
    },
  };
}

beforeEach(() => {
  __resetLinkedInAuthClientLocksForTests();
  __resetLinkedInCoordinatorForTests();
});

describe('parseLinkedInMobileReturnUrl', () => {
  it('accepts exact success URI', () => {
    const r = parseLinkedInMobileReturnUrl(successUrl());
    assert.deepEqual(r, {
      kind: 'success',
      transactionId: TX,
      result: 'ok',
    });
  });

  it('accepts exact error URI with transactionId', () => {
    const r = parseLinkedInMobileReturnUrl(errorUrl('LINKEDIN_ERROR', TX));
    assert.deepEqual(r, {
      kind: 'provider_error',
      result: 'error',
      errorCode: 'LINKEDIN_ERROR',
      transactionId: TX,
    });
  });

  it('accepts exact error URI without transactionId', () => {
    const r = parseLinkedInMobileReturnUrl(errorUrl('TX_INVALID'));
    assert.deepEqual(r, {
      kind: 'provider_error',
      result: 'error',
      errorCode: 'TX_INVALID',
    });
  });

  it('rejects wrong scheme/host/path/port/fragment', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'https://nearsy.invalid/linkedin-auth?transactionId=' + TX + '&result=ok',
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'nearsy://other-host?transactionId=' + TX + '&result=ok',
      ).kind,
      'unrelated',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'nearsy://linkedin-auth/extra?transactionId=' + TX + '&result=ok',
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'nearsy://linkedin-auth/?transactionId=' + TX + '&result=ok',
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'nearsy://linkedin-auth:443?transactionId=' + TX + '&result=ok',
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(successUrl() + '#frag').kind,
      'invalid',
    );
  });

  it('rejects userinfo and uppercase variants', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'nearsy://user:pass@linkedin-auth?transactionId=' + TX + '&result=ok',
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        'Nearsy://linkedin-auth?transactionId=' + TX + '&result=ok',
      ).kind,
      'invalid',
    );
  });

  it('rejects missing and duplicate params', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?result=ok`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=${TX}&result=ok&result=ok`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseStrictQuery('?a=1&a=2').ok,
      false,
    );
  });

  it('rejects impossible success/error combinations', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=${TX}&result=ok&error=TX_INVALID`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=${TX}&result=error`,
      ).kind,
      'invalid',
    );
  });

  it('rejects invalid encoding and malformed transactionId', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=%zz&result=ok`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?transactionId=short&result=ok`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?result=weird`,
      ).kind,
      'invalid',
    );
  });

  it('rejects error_description and unrelated links', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `${LINKEDIN_MOBILE_RETURN_URL}?result=error&error=LINKEDIN_ERROR&error_description=nope`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl('https://example.com/path').kind,
      'unrelated',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl('nearsy://welcome').kind,
      'unrelated',
    );
  });
});

describe('browser adapter mapping', () => {
  it('maps expo auth session results', () => {
    assert.deepEqual(
      mapExpoAuthSessionResult({ type: 'success', url: successUrl() }),
      { type: 'success', url: successUrl() },
    );
    assert.equal(mapExpoAuthSessionResult({ type: 'cancel' }).type, 'cancel');
    assert.equal(mapExpoAuthSessionResult({ type: 'dismiss' }).type, 'dismiss');
    assert.equal(
      mapExpoAuthSessionResult({ type: 'locked' }).type,
      'unavailable',
    );
  });
});

describe('runLinkedInBrowserAuthFlow', () => {
  it('starts before opening browser and uses Start URL verbatim', async () => {
    const authUrl =
      'https://www.linkedin.com/oauth/v2/authorization?synthetic=exact';
    const deps = createDeps({
      start: {
        transactionId: TX,
        authorizationUrl: authUrl,
        expiresAt: Date.now() + 600_000,
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'authenticated');
    assert.deepEqual(
      deps.calls.map((c) => c.name),
      [LINKEDIN_AUTH_START_CALLABLE, LINKEDIN_AUTH_EXCHANGE_CALLABLE],
    );
    assert.deepEqual(deps.opened, [authUrl]);
  });

  it('does not open browser when Start fails', async () => {
    const deps = createDeps({
      startFail: { code: 'unavailable', message: 'LinkedIn auth core is not enabled.' },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    assert.equal(deps.opened.length, 0);
    assert.equal(deps.calls.length, 1);
    assert.equal(await deps.store.read(), null);
  });

  it('exchanges after valid return', async () => {
    const deps = createDeps({});
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'authenticated');
    if (result.status === 'authenticated') {
      assert.equal(result.customToken, 'synth.custom.token');
    }
    assert.equal(await deps.store.read(), null);
  });

  it('does not exchange on invalid callback', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          return {
            type: 'success',
            url: `${LINKEDIN_MOBILE_RETURN_URL}?result=ok`,
          };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
    assert.equal(await deps.store.read(), null);
  });

  it('cancels and clears without Exchange', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          return { type: 'cancel' };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'cancelled');
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
    assert.equal(await deps.store.read(), null);
  });

  it('dismisses and clears without Exchange', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          return { type: 'dismiss' };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'dismissed');
    assert.equal(await deps.store.read(), null);
  });

  it('provider error clears without Exchange', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          return {
            type: 'success',
            url: errorUrl('LINKEDIN_ERROR', TX),
          };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'provider_error');
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
    assert.equal(await deps.store.read(), null);
  });

  it('rejects concurrent browser flows', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const deps = createDeps({
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          await gate;
          return { type: 'success', url: successUrl() };
        },
      },
    });
    const p1 = runLinkedInBrowserAuthFlow(deps);
    await new Promise((r) => setTimeout(r, 10));
    const p2 = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(p2.status, 'failed');
    if (p2.status === 'failed') {
      assert.equal(p2.error.code, 'OPERATION_IN_PROGRESS');
    }
    release();
    const r1 = await p1;
    assert.equal(r1.status, 'authenticated');
  });

  it('dedupes browser return and Linking duplicate', async () => {
    const listeners: Array<(e: { url: string }) => void> = [];
    const deps = createDeps({
      linking: {
        getInitialURL: async () => null,
        addEventListener: (_t, handler) => {
          listeners.push(handler);
          return { remove: () => {} };
        },
      },
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          const u = successUrl();
          for (const l of listeners) l({ url: u });
          return { type: 'success', url: u };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'authenticated');
    const exchanges = deps.calls.filter(
      (c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE,
    );
    assert.equal(exchanges.length, 1);
  });

  it('mismatch transactionId preserves local transaction', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession(url) {
          deps.opened.push(url);
          return {
            type: 'success',
            url: successUrl('tx_other_zzzzzzzzzzzz'),
          };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.error.code, 'CALLBACK_MISMATCH');
    }
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
    const tx = await deps.store.read();
    assert.ok(tx);
    assert.equal(tx!.transactionId, TX);
  });

  it('rejects already-consumed callback without clearing a rewritten slot', async () => {
    const deps = createDeps({});
    await runLinkedInBrowserAuthFlow(deps);
    // Simulate leftover durable tx + duplicate URL (process-local fingerprint remains).
    await deps.store.write({
      version: 2,
      transactionId: TX,
      clientProofVerifier: VERIFIER.slice(0, 64),
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      mobileReturnUrl: LINKEDIN_MOBILE_RETURN_URL,
      platform: 'android',
    });
    const second = await handleLinkedInReturnUrl(deps, successUrl(), {
      exchange: true,
      source: 'linking',
    });
    assert.equal(second.status, 'failed');
    if (second.status === 'failed') {
      assert.equal(second.error.code, 'CALLBACK_DUPLICATE');
    }
    // Duplicate must not wipe a durable slot it does not own.
    const tx = await deps.store.read();
    assert.ok(tx);
  });

  it('error without transactionId from browser_session clears local tx', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession() {
          return { type: 'success', url: errorUrl('TX_INVALID') };
        },
      },
    });
    const result = await runLinkedInBrowserAuthFlow(deps);
    assert.equal(result.status, 'provider_error');
    assert.equal(await deps.store.read(), null);
  });

  it('error without transactionId from linking preserves local tx', async () => {
    const deps = createDeps({});
    await linkedInAuthStart(deps);
    assert.ok(await deps.store.read());
    const result = await handleLinkedInReturnUrl(deps, errorUrl('TX_INVALID'), {
      exchange: true,
      source: 'linking',
    });
    assert.equal(result.status, 'ignored');
    const tx = await deps.store.read();
    assert.ok(tx);
    assert.equal(tx!.transactionId, TX);
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
  });

  it('error without transactionId on cold start preserves local tx and does not Exchange', async () => {
    const client = createDeps({});
    await linkedInAuthStart(client);
    const deps: LinkedInCoordinatorDeps = {
      ...client,
      browser: {
        async openAuthSession() {
          return { type: 'cancel' };
        },
      },
      linking: {
        getInitialURL: async () => errorUrl('TX_EXPIRED'),
        addEventListener: () => ({ remove: () => {} }),
      },
    };
    const result = await inspectInitialLinkedInReturn(deps);
    assert.equal(result.status, 'ignored');
    assert.ok(await client.store.read());
    assert.ok(
      !client.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
  });

  it('unrelated link preserves local transaction', async () => {
    const deps = createDeps({});
    await linkedInAuthStart(deps);
    const result = await handleLinkedInReturnUrl(
      deps,
      'https://example.com/path',
      { source: 'linking' },
    );
    assert.equal(result.status, 'ignored');
    assert.ok(await deps.store.read());
  });

  it('invalid callback from linking preserves local transaction', async () => {
    const deps = createDeps({});
    await linkedInAuthStart(deps);
    const result = await handleLinkedInReturnUrl(
      deps,
      `${LINKEDIN_MOBILE_RETURN_URL}?result=ok`,
      { source: 'linking' },
    );
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.error.code, 'CALLBACK_INVALID');
    }
    assert.ok(await deps.store.read());
  });

  it('duplicate during pending Exchange does not clear and yields one Exchange', async () => {
    let releaseExchange!: () => void;
    const gate = new Promise<void>((r) => {
      releaseExchange = r;
    });
    const deps = createDeps({
      exchange: async () => {
        await gate;
        return { customToken: 'synth.custom.token' };
      },
    });
    await linkedInAuthStart(deps);

    const p1 = handleLinkedInReturnUrl(deps, successUrl(), {
      exchange: true,
      source: 'browser_session',
    });
    // Allow first handle to claim fingerprint and enter Exchange.
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(await deps.store.read(), 'tx must remain while Exchange pending');

    const p2 = handleLinkedInReturnUrl(deps, successUrl(), {
      exchange: true,
      source: 'linking',
    });
    const r2 = await p2;
    assert.equal(r2.status, 'failed');
    if (r2.status === 'failed') {
      assert.equal(r2.error.code, 'CALLBACK_DUPLICATE');
    }
    // Still pending for owner — duplicate must not have cleared.
    assert.ok(await deps.store.read());

    releaseExchange();
    const r1 = await p1;
    assert.equal(r1.status, 'authenticated');
    assert.equal(await deps.store.read(), null);

    const exchanges = deps.calls.filter(
      (c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE,
    );
    assert.equal(exchanges.length, 1);
  });

  it('two concurrent handleLinkedInReturnUrl calls Exchange once', async () => {
    let releaseExchange!: () => void;
    const gate = new Promise<void>((r) => {
      releaseExchange = r;
    });
    const deps = createDeps({
      exchange: async () => {
        await gate;
        return { customToken: 'synth.custom.token' };
      },
    });
    await linkedInAuthStart(deps);
    const p1 = handleLinkedInReturnUrl(deps, successUrl(), {
      source: 'browser_session',
    });
    const p2 = handleLinkedInReturnUrl(deps, successUrl(), {
      source: 'linking',
    });
    await new Promise((r) => setTimeout(r, 20));
    releaseExchange();
    const results = await Promise.all([p1, p2]);
    const authed = results.filter((r) => r.status === 'authenticated');
    const dupes = results.filter(
      (r) =>
        r.status === 'failed' &&
        r.error.code === 'CALLBACK_DUPLICATE',
    );
    assert.equal(authed.length, 1);
    assert.equal(dupes.length, 1);
    assert.equal(
      deps.calls.filter((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE)
        .length,
      1,
    );
  });

  it('Exchange exception releases locks for a later attempt', async () => {
    const deps = createDeps({
      exchange: async () => {
        throw Object.assign(new Error('network boom'), {
          code: 'deadline-exceeded',
        });
      },
    });
    await linkedInAuthStart(deps);
    const r1 = await handleLinkedInReturnUrl(deps, successUrl(), {
      source: 'browser_session',
    });
    assert.equal(r1.status, 'failed');
    // NETWORK keeps tx (A3.4.2). Fingerprint already claimed — explicit discard + reset for new attempt.
    assert.ok(await deps.store.read());
    await discardLinkedInAuthTransaction(deps);
    __resetLinkedInCoordinatorForTests();
    __resetLinkedInAuthClientLocksForTests();
    const clean = createDeps({});
    const r2 = await runLinkedInBrowserAuthFlow(clean);
    assert.equal(r2.status, 'authenticated');
  });

  it('after durable consume, replay without in-memory fingerprint still fails Exchange', async () => {
    const deps = createDeps({});
    await linkedInAuthStart(deps);
    const ok = await handleLinkedInReturnUrl(deps, successUrl(), {
      source: 'browser_session',
    });
    assert.equal(ok.status, 'authenticated');
    assert.equal(await deps.store.read(), null);
    // Simulate process restart: clear in-memory fingerprints only.
    __resetLinkedInCoordinatorForTests();
    __resetLinkedInAuthClientLocksForTests();
    const replay = await handleLinkedInReturnUrl(deps, successUrl(), {
      source: 'cold_start',
    });
    assert.equal(replay.status, 'failed');
    if (replay.status === 'failed') {
      assert.equal(replay.error.code, 'TRANSACTION_MISSING');
    }
  });

  it('late return after cancel does not Exchange', async () => {
    const deps = createDeps({
      browser: {
        async openAuthSession() {
          return { type: 'cancel' };
        },
      },
    });
    await runLinkedInBrowserAuthFlow(deps);
    const late = await handleLinkedInReturnUrl(deps, successUrl(), {
      exchange: true,
      source: 'linking',
    });
    assert.equal(late.status, 'failed');
    if (late.status === 'failed') {
      assert.equal(late.error.code, 'TRANSACTION_MISSING');
    }
    assert.ok(
      !deps.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
  });

  it('releases flow lock after browser exception', async () => {
    const failing = createDeps({
      browser: {
        async openAuthSession() {
          throw new Error('boom');
        },
      },
    });
    const r1 = await runLinkedInBrowserAuthFlow(failing);
    assert.equal(r1.status, 'failed');
    if (r1.status === 'failed') {
      assert.equal(r1.error.code, 'BROWSER_FAILED');
    }
    const clean = createDeps({});
    const r2 = await runLinkedInBrowserAuthFlow(clean);
    assert.equal(r2.status, 'authenticated');
  });
});

describe('cold start and foreground APIs', () => {
  it('inspectInitialLinkedInReturn claims without Exchange', async () => {
    const client = createDeps({});
    await linkedInAuthStart(client);
    const deps: LinkedInCoordinatorDeps = {
      ...client,
      browser: {
        async openAuthSession() {
          return { type: 'cancel' };
        },
      },
      linking: {
        getInitialURL: async () => successUrl(),
        addEventListener: () => ({ remove: () => {} }),
      },
    };
    const result = await inspectInitialLinkedInReturn(deps);
    assert.equal(result.status, 'pending_exchange');
    if (result.status === 'pending_exchange') {
      assert.equal(result.claim.transactionId, TX);
      assert.equal(typeof result.claim.fingerprint, 'string');
      assert.ok(!('customToken' in result.claim));
    }
    assert.ok(
      !client.calls.some((c) => c.name === LINKEDIN_AUTH_EXCHANGE_CALLABLE),
    );
    // Durable verifier still present for A3.4.4
    const tx = await client.store.read();
    assert.ok(tx);
    assert.equal(tx!.transactionId, TX);
  });

  it('unrelated initial URL does not alter transaction', async () => {
    const client = createDeps({});
    await linkedInAuthStart(client);
    const deps: LinkedInCoordinatorDeps = {
      ...client,
      browser: {
        async openAuthSession() {
          return { type: 'cancel' };
        },
      },
      linking: {
        getInitialURL: async () => 'nearsy://welcome',
        addEventListener: () => ({ remove: () => {} }),
      },
    };
    const result = await inspectInitialLinkedInReturn(deps);
    assert.equal(result.status, 'ignored');
    assert.ok(await client.store.read());
  });

  it('subscribe ignores unrelated and removes cleanly', () => {
    const received: string[] = [];
    let handler: ((e: { url: string }) => void) | null = null;
    const linking: LinkedInLinkingPort = {
      getInitialURL: async () => null,
      addEventListener: (_t, h) => {
        handler = h;
        return {
          remove: () => {
            handler = null;
          },
        };
      },
    };
    const sub = subscribeLinkedInReturnUrls(linking, (url) => {
      received.push(url);
    });
    handler!({ url: 'https://example.com' });
    handler!({ url: successUrl() });
    assert.equal(received.length, 1);
    sub.remove();
    assert.equal(handler, null);
  });

  it('discard clears without auto Start', async () => {
    const deps = createDeps({});
    await linkedInAuthStart(deps);
    assert.ok(await deps.store.read());
    await discardLinkedInAuthTransaction(deps);
    assert.equal(await deps.store.read(), null);
    assert.equal(deps.calls.length, 1);
  });
});

describe('import side effects', () => {
  it('importing modules does not open browser or call Functions', async () => {
    await import('../linkedinDeepLinkParser.ts');
    await import('../linkedinBrowserSession.ts');
    await import('../linkedinAuthCoordinator.ts');
    assert.equal(linkedInReturnFingerprint(successUrl()), `ok:${TX}`);
  });
});

describe('customToken persistence absence', () => {
  it('does not write customToken into SecureStore', async () => {
    const kv = createMemorySecureKv();
    const store = createLinkedInTransactionStore(kv);
    const deps = createDeps({});
    const clientDeps: LinkedInAuthClientDeps = {
      crypto: nodeClientProofCrypto(),
      store,
      appCheck: { ensureReady: async () => {} },
      functions: deps.functions,
    };
    const full: LinkedInCoordinatorDeps = {
      ...clientDeps,
      browser: {
        async openAuthSession() {
          return { type: 'success', url: successUrl() };
        },
      },
    };
    const result = await runLinkedInBrowserAuthFlow(full);
    assert.equal(result.status, 'authenticated');
    const raw = await kv.getItem('nearsy.linkedin.auth.tx.v2');
    assert.equal(raw, null);
    if (result.status === 'authenticated') {
      assert.ok(!JSON.stringify(result).includes('persist'));
    }
  });
});
