import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createOwnershipOAuthCoordinator,
  ownershipReturnFingerprint,
  type OwnershipLinkingPort,
  type OwnershipReturnParse,
  type OwnershipStoredTx,
} from '../social/ownershipOAuth/ownershipOAuthCoordinator.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

const TX = 'ABCDEFGHijklmnop';
const VERIFIER = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWX';

function successUrl(
  host: string,
  transactionId = TX,
  mode: 'personal' | 'professional' = 'personal',
): string {
  return `nearsy://${host}?transactionId=${transactionId}&result=ok&mode=${mode}`;
}

function errorUrl(
  host: string,
  errorCode: string,
  transactionId?: string,
): string {
  const tx = transactionId ? `&transactionId=${transactionId}` : '';
  return `nearsy://${host}?result=error&error=${errorCode}${tx}`;
}

function stored(overrides: Partial<OwnershipStoredTx> = {}): OwnershipStoredTx {
  return {
    transactionId: TX,
    clientProofVerifier: VERIFIER,
    expiresAt: 1_000_000,
    uid: 'uid-a',
    mode: 'personal',
    ...overrides,
  };
}

function parseFactory(host: string) {
  return (url: string): OwnershipReturnParse => {
    if (!url.startsWith(`nearsy://${host}`)) {
      return { kind: 'unrelated' };
    }
    try {
      const parsed = new URL(url);
      const result = parsed.searchParams.get('result');
      const transactionId = parsed.searchParams.get('transactionId') ?? undefined;
      const modeRaw = parsed.searchParams.get('mode');
      const mode =
        modeRaw === 'personal' || modeRaw === 'professional'
          ? modeRaw
          : undefined;
      if (result === 'ok' && transactionId) {
        return { kind: 'success', transactionId, mode };
      }
      if (result === 'error') {
        return {
          kind: 'provider_error',
          errorCode: parsed.searchParams.get('error') ?? 'TX_FAILED',
          transactionId,
          mode,
        };
      }
      return { kind: 'invalid', reason: 'bad_query' };
    } catch {
      return { kind: 'invalid', reason: 'malformed' };
    }
  };
}

type Harness = {
  coordinator: ReturnType<
    typeof createOwnershipOAuthCoordinator<{ ok: true; tx: string }>
  >;
  store: { current: OwnershipStoredTx | null };
  uid: { current: string | null };
  exchanges: string[];
  clock: { now: number };
};

function createHarness(): Harness {
  const store = { current: stored() as OwnershipStoredTx | null };
  const uid = { current: 'uid-a' as string | null };
  const exchanges: string[] = [];
  const clock = { now: 500_000 };
  const coordinator = createOwnershipOAuthCoordinator({
    parseReturnUrl: parseFactory('youtube-ownership'),
    readStoredTx: async () => store.current,
    clearStoredTx: async () => {
      store.current = null;
    },
    currentUid: () => uid.current,
    exchange: async (tx) => {
      exchanges.push(tx.transactionId);
      return { ok: true as const, tx: tx.transactionId };
    },
    now: () => clock.now,
    sleep: async () => undefined,
    dismissGraceMs: 0,
  });
  return { coordinator, store, uid, exchanges, clock };
}

function memoryLinking(
  initial: string | null,
  extra?: { push?: (url: string) => void },
): OwnershipLinkingPort & { emit: (url: string) => void } {
  const handlers: Array<(event: { url: string }) => void> = [];
  extra?.push;
  return {
    getInitialURL: async () => initial,
    addEventListener: (_type, handler) => {
      handlers.push(handler);
      return {
        remove: () => {
          const idx = handlers.indexOf(handler);
          if (idx >= 0) handlers.splice(idx, 1);
        },
      };
    },
    emit: (url: string) => {
      for (const handler of handlers) handler({ url });
    },
  };
}

describe('NEARSY-209 ownership OAuth resume coordinator', () => {
  it('exchanges a matching Custom Tabs success exactly once', async () => {
    const h = createHarness();
    const url = successUrl('youtube-ownership');
    const first = await h.coordinator.handleReturnUrl(url, {
      source: 'browser_session',
      expectedMode: 'personal',
      expectedUid: 'uid-a',
    });
    assert.equal(first.status, 'exchanged');
    assert.deepEqual(h.exchanges, [TX]);
    assert.equal(h.store.current, null);

    const second = await h.coordinator.handleReturnUrl(url, {
      source: 'linking',
      expectedMode: 'personal',
    });
    assert.equal(second.status, 'duplicate');
    assert.deepEqual(h.exchanges, [TX]);
  });

  it('resumes after process recreation from getInitialURL without Start', async () => {
    const h = createHarness();
    const linking = memoryLinking(successUrl('youtube-ownership'));
    const resumed = await h.coordinator.inspectInitialReturn(
      linking,
      'personal',
    );
    assert.equal(resumed.status, 'exchanged');
    assert.deepEqual(h.exchanges, [TX]);
    assert.equal(h.store.current, null);
  });

  it('does not treat dismiss as cancel when a Linking return is already pending', async () => {
    const h = createHarness();
    const linking = memoryLinking(null);
    const pending = successUrl('youtube-ownership');
    const session = h.coordinator.completeBrowserSession({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      returnUrl: 'nearsy://youtube-ownership',
      expectedUid: 'uid-a',
      expectedMode: 'personal',
      linking,
      openAuthSession: async () => {
        linking.emit(pending);
        return { type: 'dismiss' };
      },
    });
    const result = await session;
    assert.equal(result.status, 'exchanged');
    assert.deepEqual(h.exchanges, [TX]);
  });

  it('clears and reports cancelled when dismiss has no related return', async () => {
    const h = createHarness();
    const linking = memoryLinking(null);
    const result = await h.coordinator.completeBrowserSession({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      returnUrl: 'nearsy://youtube-ownership',
      expectedUid: 'uid-a',
      expectedMode: 'personal',
      linking,
      openAuthSession: async () => ({ type: 'cancel' }),
    });
    assert.equal(result.status, 'cancelled');
    assert.equal(h.store.current, null);
    assert.deepEqual(h.exchanges, []);
  });

  it('rejects an expired stored proof without Exchange', async () => {
    const h = createHarness();
    h.clock.now = 2_000_000;
    const result = await h.coordinator.handleReturnUrl(
      successUrl('youtube-ownership'),
      { source: 'cold_start', expectedMode: 'personal' },
    );
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.code, 'TX_EXPIRED');
    }
    assert.equal(h.store.current, null);
    assert.deepEqual(h.exchanges, []);
  });

  it('rejects UID change and clears the unusable proof', async () => {
    const h = createHarness();
    h.uid.current = 'uid-b';
    const result = await h.coordinator.handleReturnUrl(
      successUrl('youtube-ownership'),
      { source: 'cold_start', expectedMode: 'personal' },
    );
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.code, 'session_changed');
    }
    assert.equal(h.store.current, null);
    assert.deepEqual(h.exchanges, []);
  });

  it('ignores a return for another editor mode without clearing', async () => {
    const h = createHarness();
    const result = await h.coordinator.handleReturnUrl(
      successUrl('youtube-ownership'),
      { source: 'cold_start', expectedMode: 'professional' },
    );
    assert.equal(result.status, 'ignored');
    assert.ok(h.store.current);
    assert.deepEqual(h.exchanges, []);
  });

  it('does not clear a local tx on a foreign success', async () => {
    const h = createHarness();
    const result = await h.coordinator.handleReturnUrl(
      successUrl('youtube-ownership', 'ZZZZZZZZyyyyyyyy'),
      { source: 'linking', expectedMode: 'personal' },
    );
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') {
      assert.equal(result.code, 'TX_INVALID');
    }
    assert.equal(h.store.current?.transactionId, TX);
    assert.deepEqual(h.exchanges, []);
  });

  it('ignores unrelated and already-consumed cold-start URLs', async () => {
    const h = createHarness();
    const unrelated = await h.coordinator.handleReturnUrl(
      'nearsy://linkedin-auth?transactionId=ABCDEFGHijklmnop&result=ok',
      { source: 'cold_start' },
    );
    assert.equal(unrelated.status, 'ignored');
    assert.ok(h.store.current);

    h.store.current = null;
    const consumed = await h.coordinator.handleReturnUrl(
      successUrl('youtube-ownership'),
      { source: 'cold_start', expectedMode: 'personal' },
    );
    assert.equal(consumed.status, 'ignored');
    assert.deepEqual(h.exchanges, []);
  });

  it('fingerprints success and provider errors separately', () => {
    assert.equal(
      ownershipReturnFingerprint({
        kind: 'success',
        transactionId: TX,
      }),
      `ok:${TX}`,
    );
    assert.equal(
      ownershipReturnFingerprint({
        kind: 'provider_error',
        errorCode: 'TX_FAILED',
        transactionId: TX,
      }),
      `err:${TX}:TX_FAILED`,
    );
    assert.equal(
      ownershipReturnFingerprint({ kind: 'unrelated' }),
      null,
    );
  });
});

describe('NEARSY-209 ownership OAuth resume wiring', () => {
  it('android YouTube/TikTok/X use the shared coordinator and resume APIs', () => {
    for (const rel of [
      'social/youtubeOwnership/youtubeOwnership.android.ts',
      'social/tiktokOwnership/tiktokOwnership.android.ts',
      'social/xOwnership/xOwnership.android.ts',
    ]) {
      const src = readSrc(rel);
      assert.match(src, /createOwnershipOAuthCoordinator/);
      assert.match(src, /inspectInitialReturn/);
      assert.match(src, /completeBrowserSession/);
      assert.match(src, /createOwnershipLinkingPort|Linking\.getInitialURL/);
      assert.doesNotMatch(src, /signInWithCustomToken|linkWithCredential/);
      assert.doesNotMatch(
        src,
        /browserOutcome\.type === 'cancel'[\s\S]{0,80}clearStoredTx/,
      );
    }
  });

  it('cards resume pending returns on mount without auto-Start', () => {
    const youtube = readSrc('components/profile/YoutubeOwnershipCard.tsx');
    const tiktok = readSrc('components/profile/TiktokOwnershipCard.tsx');
    const x = readSrc('components/profile/XOwnershipCard.tsx');
    assert.match(youtube, /resumeYoutubeOwnershipReturn/);
    assert.match(tiktok, /resumeTiktokOwnershipReturn/);
    assert.match(x, /resumeXOwnershipReturn/);
    assert.doesNotMatch(youtube, /connectYoutubeOwnership\(mode\).*useEffect/);
    assert.doesNotMatch(youtube, /authorizationUrl/);
    assert.doesNotMatch(tiktok, /authorizationUrl/);
    assert.doesNotMatch(x, /authorizationUrl/);
  });

  it('does not modify LinkedIn login modules', () => {
    const coordinator = readSrc(
      'authentication/linkedin/linkedinAuthCoordinator.ts',
    );
    const android = readSrc('authentication/linkedin/linkedinAuth.android.ts');
    assert.doesNotMatch(coordinator, /ownershipOAuthCoordinator/);
    assert.doesNotMatch(android, /ownershipOAuthCoordinator/);
    assert.match(android, /createDefaultCoordinatorDeps/);
  });
});
