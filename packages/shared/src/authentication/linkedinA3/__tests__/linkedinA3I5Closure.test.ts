/**
 * I5 LinkedIn A3 iOS closure: profileHints, expiry, errors, durable recovery.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';

import { createAppCheckBootstrap } from '../appCheck/appCheckBootstrap';
import { createClientProofPair, type ClientProofCrypto } from '../clientProof';
import { createLinkedInA3CallableClient } from '../functions/linkedInA3CallableClient';
import { mapExpoAuthSessionResult } from '../browserSession';
import {
  clearLinkedInA3ResumeStateForTests,
  resumeLinkedInA3FromLaunchUrl,
  resumeLinkedInA3FromReturnUrl,
} from '../durableResume';
import {
  createInMemoryLinkedInA3DurableStore,
  durableRecordHasForbiddenFields,
  parseLinkedInA3DurableRecord,
  serializeLinkedInA3DurableRecord,
} from '../durableTransactionStore';
import {
  isLinkedInTransactionExpired,
  normalizeLinkedInExpiresAtMs,
} from '../expiresAt';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';
import {
  clearLinkedInA3OrchestratorStateForTests,
  runLinkedInA3BrowserAuthFlow,
  type LinkedInA3OrchestratorDeps,
} from '../orchestrator';
import {
  buildLinkedInSocialProfileFromAuthHints,
  mergeLinkedInProfileHints,
  queueLinkedInCrjPrefillIfNeeded,
} from '../profilePrefill';
import { LinkedInA3ClientError, toSanitizedCallableError } from '../sanitize';
import { mapSocialProfileToNamePrefill } from '../../social/application/mapSocialNamePrefill';
import {
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
} from '../../social/application/socialProfilePrefillStore';
import { assertLinkedInAuthExchangeResult } from '../types';

const nodeCrypto: ClientProofCrypto = {
  getRandomBytes: (n) => randomBytes(n),
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest(),
};

const TX = 'AbcdefghijkLmnoPqrsTuv';
const OTHER_TX = 'ZyxwvutsrqpoNmlkjihGfe';
const CUSTOM_TOKEN = 'custom-token-value-long-enough';
const UID = 'uid-linkedin-i5';

function successUrl(transactionId = TX): string {
  return `nearsy://linkedin-auth?transactionId=${transactionId}&result=ok`;
}

function errorUrl(code: string, transactionId = TX): string {
  return `nearsy://linkedin-auth?transactionId=${transactionId}&result=error&error=${code}`;
}

async function readyClient(invoke: (name: string, data: Record<string, unknown>) => Promise<unknown>) {
  const appCheck = createAppCheckBootstrap({
    port: {
      async initialize() {},
      async ensureToken() {},
    },
    maxAttempts: 1,
  });
  await appCheck.initialize();
  return createLinkedInA3CallableClient({
    environment: resolveNearsyFirebaseEnvironment('development'),
    appCheck,
    getNativeProjectId: () => 'nearsy-dev',
    getJsProjectId: () => 'nearsy-dev',
    invoke,
  });
}

function baseDeps(
  overrides: Partial<LinkedInA3OrchestratorDeps> & {
    startImpl?: () => Promise<{
      transactionId: string;
      authorizationUrl: string;
      expiresAt: number;
    }>;
    exchangeImpl?: () => Promise<{
      customToken: string;
      profileHints?: {
        givenName?: string;
        familyName?: string;
        displayName?: string;
        photoUrl?: string;
      };
    }>;
    browserResult?: { type: string; url?: string };
    signInImpl?: (token: string) => Promise<{ uid: string; email: string | null }>;
    durableStore?: LinkedInA3OrchestratorDeps['durableStore'];
    now?: () => number;
  } = {},
): LinkedInA3OrchestratorDeps {
  const startImpl =
    overrides.startImpl ??
    (async () => ({
      transactionId: TX,
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1',
      expiresAt: Date.now() + 600_000,
    }));
  const exchangeImpl =
    overrides.exchangeImpl ??
    (async () => ({ customToken: CUSTOM_TOKEN }));
  const signInImpl =
    overrides.signInImpl ??
    (async () => ({ uid: 'uid-1', email: 'a@b.c' }));
  const browserResult = overrides.browserResult ?? {
    type: 'success',
    url: successUrl(),
  };

  return {
    platform: 'ios',
    crypto: nodeCrypto,
    browser: {
      openAuthSession: async () => mapExpoAuthSessionResult(browserResult),
    },
    getClient: async () =>
      ({
        start: startImpl,
        exchange: exchangeImpl,
      }) as any,
    auth: {
      getCurrentUid: () => null,
      signInWithCustomToken: signInImpl,
    },
    durableStore: overrides.durableStore,
    now: overrides.now,
    ...overrides,
  };
}

describe('assertLinkedInAuthExchangeResult profileHints', () => {
  it('accepts legacy backend payload with only customToken', () => {
    const result = assertLinkedInAuthExchangeResult({ customToken: CUSTOM_TOKEN });
    assert.equal(result.customToken, CUSTOM_TOKEN);
    assert.equal(result.profileHints, undefined);
  });

  it('parses optional profileHints', () => {
    const result = assertLinkedInAuthExchangeResult({
      customToken: CUSTOM_TOKEN,
      profileHints: {
        givenName: ' Ada ',
        familyName: ' Lovelace ',
        displayName: ' Ada Lovelace ',
        photoUrl: 'https://media.licdn.com/dms/image/p.png',
      },
    });
    assert.deepEqual(result.profileHints, {
      givenName: 'Ada',
      familyName: 'Lovelace',
      displayName: 'Ada Lovelace',
      photoUrl: 'https://media.licdn.com/dms/image/p.png',
    });
  });

  it('ignores malformed profileHints and keeps customToken', () => {
    const result = assertLinkedInAuthExchangeResult({
      customToken: CUSTOM_TOKEN,
      profileHints: 'not-an-object',
    });
    assert.equal(result.customToken, CUSTOM_TOKEN);
    assert.equal(result.profileHints, undefined);
  });
});

describe('callable Exchange profileHints + legacy backend', () => {
  it('returns hints when present and omits them when absent', async () => {
    const withHints = await readyClient(async (name) => {
      assert.equal(name, 'linkedinAuthExchange');
      return {
        customToken: CUSTOM_TOKEN,
        profileHints: { givenName: 'Ada', familyName: 'Lovelace' },
      };
    });
    const hinted = await withHints.exchange({
      transactionId: TX,
      clientProofVerifier: 'v'.repeat(20),
    });
    assert.deepEqual(hinted.profileHints, {
      givenName: 'Ada',
      familyName: 'Lovelace',
    });

    const legacy = await readyClient(async () => ({ customToken: CUSTOM_TOKEN }));
    const plain = await legacy.exchange({
      transactionId: TX,
      clientProofVerifier: 'v'.repeat(20),
    });
    assert.equal(plain.customToken, CUSTOM_TOKEN);
    assert.equal(plain.profileHints, undefined);
  });

  it('maps Exchange consumed and network distinctly from Start failed-precondition', async () => {
    const consumed = await readyClient(async () => {
      const err = new Error('already');
      (err as { code?: string }).code = 'functions/failed-precondition';
      throw err;
    });
    await assert.rejects(
      () =>
        consumed.exchange({
          transactionId: TX,
          clientProofVerifier: 'v'.repeat(20),
        }),
      (err: unknown) =>
        err instanceof LinkedInA3ClientError &&
        err.code === 'EXCHANGE_ALREADY_CONSUMED',
    );

    const start = await readyClient(async () => {
      const err = new Error('secret token abc');
      (err as { code?: string }).code = 'functions/failed-precondition';
      throw err;
    });
    await assert.rejects(
      () =>
        start.start({
          platform: 'ios',
          clientProofChallenge: 'challenge-value-123456',
          clientProofMethod: 'S256',
        }),
      (err: unknown) =>
        err instanceof LinkedInA3ClientError && err.code === 'CALLABLE_FAILED',
    );

    const networked = await readyClient(async () => {
      const err = new Error('Network request failed');
      (err as { code?: string }).code = 'functions/unavailable';
      throw err;
    });
    await assert.rejects(
      () =>
        networked.exchange({
          transactionId: TX,
          clientProofVerifier: 'v'.repeat(20),
        }),
      (err: unknown) =>
        err instanceof LinkedInA3ClientError && err.code === 'NETWORK',
    );
  });
});

describe('LinkedIn I5 profileHints prefill', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  it('prefers givenName/familyName and does not split displayName', () => {
    const queued = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: false,
      givenName: 'Ada',
      familyName: 'Lovelace',
      displayName: 'Ada Lovelace Extra',
    });
    assert.equal(queued.queued, true);
    assert.equal(queued.hasGivenName, true);
    assert.equal(queued.hasFamilyName, true);
    const pending = peekPendingSocialProfilePrefill();
    const names = mapSocialProfileToNamePrefill(pending!.socialProfile);
    assert.equal(names.firstName, 'Ada');
    assert.equal(names.lastName, 'Lovelace');
  });

  it('falls back to displayName without inventing last name', () => {
    const social = buildLinkedInSocialProfileFromAuthHints({
      displayName: 'Ada Lovelace',
    });
    assert.ok(social);
    const names = mapSocialProfileToNamePrefill(social);
    assert.equal(names.firstName, 'Ada Lovelace');
    assert.equal(names.lastName, '');
  });

  it('uses currentUser displayName/photoURL only as last fallback', () => {
    const merged = mergeLinkedInProfileHints({
      exchangeHints: { givenName: 'Grace' },
      authDisplayName: 'Auth Display',
      authPhotoURL: 'https://media.licdn.com/dms/image/auth.png',
    });
    assert.equal(merged.givenName, 'Grace');
    assert.equal(merged.displayName, 'Auth Display');
    assert.equal(merged.photoUrl, 'https://media.licdn.com/dms/image/auth.png');
  });

  it('drops invalid photo URLs', () => {
    const queued = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: false,
      givenName: 'Ada',
      photoUrl: 'http://insecure.example/p.png',
      photoURL: 'javascript:alert(1)',
    });
    assert.equal(queued.queued, true);
    assert.equal(queued.hasPhotoUrl, false);
    assert.equal(
      peekPendingSocialProfilePrefill()?.socialProfile.photoUrl,
      undefined,
    );
  });

  it('does not write pending for complete users', () => {
    const queued = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: true,
      givenName: 'Ada',
      familyName: 'Lovelace',
      photoUrl: 'https://media.licdn.com/dms/image/p.png',
    });
    assert.equal(queued.queued, false);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });
});

describe('expiresAt helpers', () => {
  it('normalizes seconds and milliseconds', () => {
    assert.equal(normalizeLinkedInExpiresAtMs(1_700_000_000_000), 1_700_000_000_000);
    assert.equal(normalizeLinkedInExpiresAtMs(1_000_000_000_000), 1_000_000_000_000);
    assert.equal(normalizeLinkedInExpiresAtMs(1_700_000_000), 1_700_000_000_000);
    assert.equal(isLinkedInTransactionExpired(Date.now() - 1), true);
    assert.equal(isLinkedInTransactionExpired(Date.now() + 60_000), false);
  });
});

describe('toSanitizedCallableError I5 codes', () => {
  it('distinguishes App Check, expired, network, and consumed', () => {
    const appCheck = toSanitizedCallableError({
      code: 'functions/unauthenticated',
    });
    assert.equal(appCheck.code, 'APP_CHECK_FAILED');

    const expired = toSanitizedCallableError(
      { details: { code: 'TX_EXPIRED' } },
      'exchange',
    );
    assert.equal(expired.code, 'TX_EXPIRED');

    const network = toSanitizedCallableError(
      { code: 'functions/deadline-exceeded' },
      'start',
    );
    assert.equal(network.code, 'NETWORK');

    const consumed = toSanitizedCallableError(
      { code: 'functions/already-exists' },
      'exchange',
    );
    assert.equal(consumed.code, 'EXCHANGE_ALREADY_CONSUMED');
  });
});

describe('orchestrator expiry, cancel, network, durable clear', () => {
  beforeEach(() => {
    clearLinkedInA3OrchestratorStateForTests();
  });

  it('does not open the browser or Exchange when Start expiresAt is already past', async () => {
    let browserCalls = 0;
    let exchangeCalls = 0;
    const store = createInMemoryLinkedInA3DurableStore();
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        durableStore: store,
        now: () => 2_000_000_000_000,
        startImpl: async () => ({
          transactionId: TX,
          authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
          expiresAt: 1_000_000_000_000,
        }),
        exchangeImpl: async () => {
          exchangeCalls += 1;
          return { customToken: CUSTOM_TOKEN };
        },
        browser: {
          openAuthSession: async () => {
            browserCalls += 1;
            return mapExpoAuthSessionResult({ type: 'success', url: successUrl() });
          },
        },
      }),
    );
    assert.equal(result.status, 'expired');
    assert.equal(result.error?.code, 'TX_EXPIRED');
    assert.equal(result.retrySafe, true);
    assert.equal(browserCalls, 0);
    assert.equal(exchangeCalls, 0);
    assert.equal(await store.load(), null);
  });

  it('treats TX_EXPIRED callback as expired without Exchange', async () => {
    let exchangeCalls = 0;
    const store = createInMemoryLinkedInA3DurableStore();
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        durableStore: store,
        browserResult: { type: 'success', url: errorUrl('TX_EXPIRED') },
        exchangeImpl: async () => {
          exchangeCalls += 1;
          return { customToken: CUSTOM_TOKEN };
        },
      }),
    );
    assert.equal(result.status, 'expired');
    assert.equal(exchangeCalls, 0);
    assert.equal(result.retrySafe, true);
    assert.equal(await store.load(), null);
  });

  it('cancels without Exchange and clears durable state', async () => {
    let exchangeCalls = 0;
    const store = createInMemoryLinkedInA3DurableStore();
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        durableStore: store,
        browserResult: { type: 'cancel' },
        exchangeImpl: async () => {
          exchangeCalls += 1;
          return { customToken: CUSTOM_TOKEN };
        },
      }),
    );
    assert.equal(result.status, 'cancelled');
    assert.equal(exchangeCalls, 0);
    assert.equal(result.retrySafe, true);
    assert.equal(await store.load(), null);
  });

  it('maps provider error distinctly from cancel and expiry', async () => {
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        browserResult: { type: 'success', url: errorUrl('LINKEDIN_ERROR') },
      }),
    );
    assert.equal(result.status, 'provider_error');
    assert.equal(result.providerErrorCode, 'LINKEDIN_ERROR');
    assert.equal(result.retrySafe, true);
  });

  it('allows safe retry when network fails before Exchange', async () => {
    const store = createInMemoryLinkedInA3DurableStore();
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        durableStore: store,
        startImpl: async () => {
          throw new LinkedInA3ClientError('NETWORK', 'start network');
        },
      }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'NETWORK');
    assert.equal(result.exchangeConsumed, false);
    assert.equal(result.retrySafe, true);
    assert.equal(await store.load(), null);
  });

  it('forbids same-transaction retry when network fails after Exchange starts', async () => {
    const store = createInMemoryLinkedInA3DurableStore();
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        durableStore: store,
        exchangeImpl: async () => {
          throw new LinkedInA3ClientError('NETWORK', 'exchange network');
        },
      }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'NETWORK');
    assert.equal(result.exchangeConsumed, true);
    assert.equal(result.retrySafe, false);
    assert.equal(await store.load(), null);
  });

  it('maps Exchange already consumed', async () => {
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        exchangeImpl: async () => {
          throw new LinkedInA3ClientError(
            'EXCHANGE_ALREADY_CONSUMED',
            'already used',
          );
        },
      }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'EXCHANGE_ALREADY_CONSUMED');
    assert.equal(result.retrySafe, false);
  });

  it('maps App Check failure on Start without Exchange', async () => {
    let exchangeCalls = 0;
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        startImpl: async () => {
          throw new LinkedInA3ClientError('APP_CHECK_FAILED', 'app check');
        },
        exchangeImpl: async () => {
          exchangeCalls += 1;
          return { customToken: CUSTOM_TOKEN };
        },
      }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'APP_CHECK_FAILED');
    assert.equal(result.retrySafe, true);
    assert.equal(exchangeCalls, 0);
  });

  it('passes Exchange profileHints on authenticated result', async () => {
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        exchangeImpl: async () => ({
          customToken: CUSTOM_TOKEN,
          profileHints: { givenName: 'Ada', familyName: 'Lovelace' },
        }),
      }),
    );
    assert.equal(result.status, 'authenticated');
    if (result.status === 'authenticated') {
      assert.deepEqual(result.profileHints, {
        givenName: 'Ada',
        familyName: 'Lovelace',
      });
    }
  });

  it('keeps legacy customToken-only Exchange working', async () => {
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({
        exchangeImpl: async () => ({ customToken: CUSTOM_TOKEN }),
      }),
    );
    assert.equal(result.status, 'authenticated');
    if (result.status === 'authenticated') {
      assert.equal(result.profileHints, undefined);
    }
  });

  it('blocks double Start while in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const deps = baseDeps({
      startImpl: async () => {
        await gate;
        return {
          transactionId: TX,
          authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
          expiresAt: Date.now() + 600_000,
        };
      },
    });
    const p1 = runLinkedInA3BrowserAuthFlow(deps);
    const p2 = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(p2.status, 'session_already_active');
    assert.equal(p2.retrySafe, false);
    release();
    const r1 = await p1;
    assert.equal(r1.status, 'authenticated');
  });

  it('clears durable register after success', async () => {
    const store = createInMemoryLinkedInA3DurableStore();
    const result = await runLinkedInA3BrowserAuthFlow(
      baseDeps({ durableStore: store }),
    );
    assert.equal(result.status, 'authenticated');
    assert.equal(await store.load(), null);
  });
});

describe('durable transaction register', () => {
  it('serializes only the four allowed fields', async () => {
    const pair = await createClientProofPair(nodeCrypto);
    const record = {
      transactionId: TX,
      clientProofVerifier: pair.clientProofVerifier,
      expiresAt: Date.now() + 60_000,
      startedAt: Date.now(),
    };
    const json = serializeLinkedInA3DurableRecord(record);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), [
      'clientProofVerifier',
      'expiresAt',
      'startedAt',
      'transactionId',
    ]);
    assert.equal(durableRecordHasForbiddenFields(parsed), false);
  });

  it('rejects payloads that include tokens or PII', () => {
    assert.equal(
      parseLinkedInA3DurableRecord({
        transactionId: TX,
        clientProofVerifier: 'v'.repeat(43),
        expiresAt: 1,
        startedAt: 1,
        customToken: 'nope',
      }),
      null,
    );
    assert.equal(
      durableRecordHasForbiddenFields({
        transactionId: TX,
        email: 'a@b.c',
      }),
      true,
    );
  });

  it('keeps a single active transaction and replaces on save', async () => {
    const pair = await createClientProofPair(nodeCrypto);
    const store = createInMemoryLinkedInA3DurableStore();
    await store.save({
      transactionId: TX,
      clientProofVerifier: pair.clientProofVerifier,
      expiresAt: Date.now() + 60_000,
      startedAt: Date.now(),
    });
    const pair2 = await createClientProofPair(nodeCrypto);
    await store.save({
      transactionId: OTHER_TX,
      clientProofVerifier: pair2.clientProofVerifier,
      expiresAt: Date.now() + 60_000,
      startedAt: Date.now(),
    });
    const loaded = await store.load();
    assert.equal(loaded?.transactionId, OTHER_TX);
  });
});

describe('durable resume from initial URL', () => {
  beforeEach(() => {
    clearLinkedInA3OrchestratorStateForTests();
    clearLinkedInA3ResumeStateForTests();
  });

  async function persistActive(store = createInMemoryLinkedInA3DurableStore()) {
    const pair = await createClientProofPair(nodeCrypto);
    await store.save({
      transactionId: TX,
      clientProofVerifier: pair.clientProofVerifier,
      expiresAt: Date.now() + 600_000,
      startedAt: Date.now(),
    });
    return { store, pair };
  }

  it('resumes a matching initial callback and clears on success', async () => {
    const { store } = await persistActive();
    let exchangeCalls = 0;
    const result = await resumeLinkedInA3FromLaunchUrl(
      async () => successUrl(),
      {
        durableStore: store,
        getClient: async () =>
          ({
            start: async () => {
              throw new Error('Start must not run on resume');
            },
            exchange: async () => {
              exchangeCalls += 1;
              return { customToken: CUSTOM_TOKEN };
            },
          }) as any,
        auth: {
          getCurrentUid: () => null,
          signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
        },
      },
    );
    assert.equal(result.status, 'authenticated');
    assert.equal(exchangeCalls, 1);
    assert.equal(await store.load(), null);
  });

  it('rejects callback mismatch and clears durable state', async () => {
    const { store } = await persistActive();
    let exchangeCalls = 0;
    const result = await resumeLinkedInA3FromReturnUrl(successUrl(OTHER_TX), {
      durableStore: store,
      getClient: async () =>
        ({
          exchange: async () => {
            exchangeCalls += 1;
            return { customToken: CUSTOM_TOKEN };
          },
        }) as any,
      auth: {
        getCurrentUid: () => null,
        signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
      },
    });
    assert.equal(result.status, 'failed');
    if (result.status !== 'skipped') {
      assert.equal(result.error?.code, 'CALLBACK_MISMATCH');
    }
    assert.equal(exchangeCalls, 0);
    assert.equal(await store.load(), null);
  });

  it('rejects expired persisted transactions without Exchange', async () => {
    const pair = await createClientProofPair(nodeCrypto);
    const store = createInMemoryLinkedInA3DurableStore();
    await store.save({
      transactionId: TX,
      clientProofVerifier: pair.clientProofVerifier,
      expiresAt: 1_000,
      startedAt: 1,
    });
    let exchangeCalls = 0;
    const result = await resumeLinkedInA3FromReturnUrl(successUrl(), {
      durableStore: store,
      now: () => 2_000_000_000_000,
      getClient: async () =>
        ({
          exchange: async () => {
            exchangeCalls += 1;
            return { customToken: CUSTOM_TOKEN };
          },
        }) as any,
      auth: {
        getCurrentUid: () => null,
        signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
      },
    });
    assert.equal(result.status, 'expired');
    assert.equal(exchangeCalls, 0);
    assert.equal(await store.load(), null);
  });

  it('anti-replay: second identical callback does not Exchange again', async () => {
    const { store } = await persistActive();
    let exchangeCalls = 0;
    const deps = {
      durableStore: store,
      getClient: async () =>
        ({
          exchange: async () => {
            exchangeCalls += 1;
            return { customToken: CUSTOM_TOKEN };
          },
        }) as any,
      auth: {
        getCurrentUid: () => null,
        signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
      },
    };
    const first = await resumeLinkedInA3FromReturnUrl(successUrl(), deps);
    const second = await resumeLinkedInA3FromReturnUrl(successUrl(), deps);
    assert.equal(first.status, 'authenticated');
    assert.equal(second.status, 'skipped');
    if (second.status === 'skipped') {
      assert.equal(second.reason, 'no_persisted_transaction');
    }
    assert.equal(exchangeCalls, 1);
  });

  it('skips unrelated launch URLs without clearing the register', async () => {
    const { store } = await persistActive();
    const result = await resumeLinkedInA3FromLaunchUrl(
      async () => 'https://nearsy.app/other',
      {
        durableStore: store,
        getClient: async () =>
          ({
            exchange: async () => {
              throw new Error('should not exchange');
            },
          }) as any,
        auth: {
          getCurrentUid: () => null,
          signInWithCustomToken: async () => ({ uid: 'uid-1', email: null }),
        },
      },
    );
    assert.equal(result.status, 'skipped');
    if (result.status === 'skipped') {
      assert.equal(result.reason, 'unrelated');
    }
    assert.equal((await store.load())?.transactionId, TX);
  });

  it('skips when getInitialURL is empty', async () => {
    const result = await resumeLinkedInA3FromLaunchUrl(async () => null, {
      durableStore: createInMemoryLinkedInA3DurableStore(),
      getClient: async () => ({}) as any,
      auth: {
        getCurrentUid: () => null,
        signInWithCustomToken: async () => ({ uid: 'x', email: null }),
      },
    });
    assert.equal(result.status, 'skipped');
    if (result.status === 'skipped') {
      assert.equal(result.reason, 'no_initial_url');
    }
  });
});
