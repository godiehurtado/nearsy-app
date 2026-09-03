/**
 * I2 LinkedIn A3 happy-path unit tests (orchestrator, return URL, gates).
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';

import {
  bytesToBase64Url,
  createClientProofPair,
  createS256ClientProofChallenge,
  type ClientProofCrypto,
} from '../clientProof';
import { parseLinkedInMobileReturnUrl } from '../returnUrl';
import { mapExpoAuthSessionResult } from '../browserSession';
import {
  clearLinkedInA3OrchestratorStateForTests,
  runLinkedInA3BrowserAuthFlow,
  type LinkedInA3OrchestratorDeps,
} from '../orchestrator';
import { LinkedInA3ClientError } from '../sanitize';
import { shouldShowLinkedInA3DevSmokePanel } from '../smoke/devSmokePanelGate';
import { sanitizeAuthorizationUrl, sanitizeTransactionId } from '../sanitize';
import { resolveNearsyFirebaseEnvironment } from '../environment/nearsyFirebaseEnvironment';

const nodeCrypto: ClientProofCrypto = {
  getRandomBytes: (n) => randomBytes(n),
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest(),
};

const TX = 'AbcdefghijkLmnoPqrsTuv';

function baseDeps(
  overrides: Partial<LinkedInA3OrchestratorDeps> & {
    startImpl?: () => Promise<{
      transactionId: string;
      authorizationUrl: string;
      expiresAt: number;
    }>;
    exchangeImpl?: () => Promise<{ customToken: string }>;
    browserResult?: { type: string; url?: string };
    signInImpl?: (token: string) => Promise<{ uid: string; email: string | null }>;
  } = {},
): LinkedInA3OrchestratorDeps {
  let exchangeCalls = 0;
  let signInCalls = 0;
  const startImpl =
    overrides.startImpl ??
    (async () => ({
      transactionId: TX,
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1',
      expiresAt: Date.now() + 600_000,
    }));
  const exchangeImpl =
    overrides.exchangeImpl ??
    (async () => {
      exchangeCalls += 1;
      return { customToken: 'custom-token-value-long-enough' };
    });
  const signInImpl =
    overrides.signInImpl ??
    (async () => {
      signInCalls += 1;
      return { uid: 'uid-1', email: 'a@b.c' };
    });

  const browserResult = overrides.browserResult ?? {
    type: 'success',
    url: `nearsy://linkedin-auth?transactionId=${TX}&result=ok`,
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
    ...overrides,
    // keep counters accessible via closure for assertions in tests that need them
    // @ts-expect-error test helper
    __counters: { get exchangeCalls() { return exchangeCalls; }, get signInCalls() { return signInCalls; } },
  };
}

describe('clientProof S256', () => {
  it('derives challenge that is not the verifier', async () => {
    const pair = await createClientProofPair(nodeCrypto);
    assert.equal(pair.clientProofMethod, 'S256');
    assert.notEqual(pair.clientProofVerifier, pair.clientProofChallenge);
    const again = await createS256ClientProofChallenge(
      nodeCrypto,
      pair.clientProofVerifier,
    );
    assert.equal(again, pair.clientProofChallenge);
  });
});

describe('parseLinkedInMobileReturnUrl', () => {
  it('accepts exact success return', () => {
    const r = parseLinkedInMobileReturnUrl(
      `nearsy://linkedin-auth?transactionId=${TX}&result=ok`,
    );
    assert.equal(r.kind, 'success');
  });

  it('rejects foreign hosts and OAuth secrets in query', () => {
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `https://evil.example/linkedin-auth?transactionId=${TX}&result=ok`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseLinkedInMobileReturnUrl(
        `nearsy://linkedin-auth?transactionId=${TX}&result=ok&code=abc`,
      ).kind,
      'invalid',
    );
  });
});

describe('shouldShowLinkedInA3DevSmokePanel I2 gate', () => {
  const base = {
    isDev: true,
    platform: 'ios',
    firebaseEnvironment: 'development',
    linkedInAuthEnabled: 'true',
  };

  it('hides by default without explicit enable', () => {
    assert.equal(shouldShowLinkedInA3DevSmokePanel(base), false);
  });

  it('shows only when explicitly enabled', () => {
    assert.equal(
      shouldShowLinkedInA3DevSmokePanel({
        ...base,
        smokePanelExplicitlyEnabled: 'true',
      }),
      true,
    );
  });

  it('Production LinkedIn is enabled for MVP', () => {
    const env = resolveNearsyFirebaseEnvironment('production');
    assert.equal(env.linkedInAuthEnabled, true);
  });
});

describe('sanitize helpers', () => {
  it('truncates transaction id and strips authorization query', () => {
    assert.equal(sanitizeTransactionId(TX).includes(TX), false);
    const url = sanitizeAuthorizationUrl(
      'https://www.linkedin.com/oauth/v2/authorization?client_id=x&state=secret',
    );
    assert.equal(url.includes('state='), false);
    assert.equal(url.includes('client_id'), false);
  });
});

describe('runLinkedInA3BrowserAuthFlow', () => {
  beforeEach(() => {
    clearLinkedInA3OrchestratorStateForTests();
  });

  it('completes happy path with single exchange and sign-in', async () => {
    let exchangeCalls = 0;
    let signInCalls = 0;
    const deps = baseDeps({
      exchangeImpl: async () => {
        exchangeCalls += 1;
        return { customToken: 'custom-token-value-long-enough' };
      },
      signInImpl: async () => {
        signInCalls += 1;
        return { uid: 'uid-1', email: null };
      },
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'authenticated');
    assert.equal(exchangeCalls, 1);
    assert.equal(signInCalls, 1);
  });

  it('handles cancel without exchange', async () => {
    let exchangeCalls = 0;
    const deps = baseDeps({
      browserResult: { type: 'cancel' },
      exchangeImpl: async () => {
        exchangeCalls += 1;
        return { customToken: 'x'.repeat(20) };
      },
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'cancelled');
    assert.equal(exchangeCalls, 0);
  });

  it('blocks double press / concurrent session', async () => {
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
    release();
    const r1 = await p1;
    assert.equal(r1.status, 'authenticated');
  });

  it('maps Start failure', async () => {
    const deps = baseDeps({
      startImpl: async () => {
        throw new LinkedInA3ClientError('CALLABLE_FAILED', 'start failed');
      },
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    assert.ok(result.error instanceof LinkedInA3ClientError);
  });

  it('maps invalid callback', async () => {
    const deps = baseDeps({
      browserResult: {
        type: 'success',
        url: 'nearsy://linkedin-auth?result=ok',
      },
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'CALLBACK_INVALID');
  });

  it('maps Exchange failure', async () => {
    const deps = baseDeps({
      exchangeImpl: async () => {
        throw new LinkedInA3ClientError('CALLABLE_FAILED', 'exchange failed');
      },
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
  });

  it('maps missing Custom Token', async () => {
    const deps = baseDeps({
      exchangeImpl: async () => ({ customToken: '' }) as any,
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'CUSTOM_TOKEN_MISSING');
  });

  it('maps signInWithCustomToken failure', async () => {
    const deps = baseDeps({
      signInImpl: async () => {
        throw new Error('auth boom');
      },
    });
    const result = await runLinkedInA3BrowserAuthFlow(deps);
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'FIREBASE_SIGN_IN_FAILED');
  });

  it('clears verifier after cancel (no reuse)', async () => {
    const depsCancel = baseDeps({ browserResult: { type: 'cancel' } });
    await runLinkedInA3BrowserAuthFlow(depsCancel);
    const depsOk = baseDeps();
    const result = await runLinkedInA3BrowserAuthFlow(depsOk);
    assert.equal(result.status, 'authenticated');
  });
});

describe('bytesToBase64Url sanity', () => {
  it('encodes without + / =', () => {
    const s = bytesToBase64Url(Uint8Array.from([0xff, 0x00, 0x01]));
    assert.equal(/\+|\/|=/.test(s), false);
  });
});
