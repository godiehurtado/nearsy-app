import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  AccountDeletionReauthError,
  isLinkedInDeterministicUid,
  readCustomTokenUid,
  refreshLinkedInSessionForDeletion,
  resolveDeletionReauthMethod,
  resolveDeletionReauthMethods,
  type LinkedInDeletionReauthDeps,
} from '../index';
import type {
  LinkedInA3FirebaseAuthPort,
  LinkedInA3FlowResult,
} from '../../../authentication/linkedinA3/orchestrator';

function fakeCustomToken(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

function depsFor(input: {
  currentUid: string | null;
  tokenUid?: string;
  flowStatus?: LinkedInA3FlowResult['status'];
  flowThrows?: boolean;
}) {
  let currentUid = input.currentUid;
  const signIns: string[] = [];
  const deps: LinkedInDeletionReauthDeps = {
    getCurrentUid: () => currentUid,
    signInWithCustomToken: async (token) => {
      const uid = readCustomTokenUid(token) ?? 'unknown';
      signIns.push(uid);
      currentUid = uid;
      return { uid, email: null };
    },
    runFlow: async (auth: LinkedInA3FirebaseAuthPort) => {
      if (input.flowThrows) throw new Error('flow crashed');
      if (input.flowStatus && input.flowStatus !== 'authenticated') {
        return { status: input.flowStatus } as LinkedInA3FlowResult;
      }
      try {
        const session = await auth.signInWithCustomToken(
          fakeCustomToken({ uid: input.tokenUid ?? 'li_abc', iss: 'svc' }),
        );
        return { status: 'authenticated', session };
      } catch {
        return { status: 'failed' } as LinkedInA3FlowResult;
      }
    },
  };
  return { deps, signIns };
}

describe('LinkedIn deletion reauth — same deterministic UID only', () => {
  it('reads the uid claim of a custom token without verifying it', () => {
    assert.equal(readCustomTokenUid(fakeCustomToken({ uid: 'li_abc' })), 'li_abc');
    assert.equal(readCustomTokenUid('not-a-jwt'), null);
    assert.equal(readCustomTokenUid(fakeCustomToken({ sub: 'x' })), null);
    assert.equal(readCustomTokenUid('a.@@@.c'), null);
  });

  it('recognizes only the li_ deterministic UID scheme', () => {
    assert.equal(isLinkedInDeterministicUid('li_abc'), true);
    assert.equal(isLinkedInDeterministicUid('li_'), false);
    assert.equal(isLinkedInDeterministicUid('firebase-uid'), false);
    assert.equal(isLinkedInDeterministicUid(null), false);
  });

  it('accepts a fresh session that returns to the same UID', async () => {
    const { deps, signIns } = depsFor({ currentUid: 'li_abc' });
    await refreshLinkedInSessionForDeletion('li_abc', deps);
    assert.deepEqual(signIns, ['li_abc']);
  });

  it('a token for another LinkedIn account is never signed in (no session switch, no merge)', async () => {
    const { deps, signIns } = depsFor({ currentUid: 'li_abc', tokenUid: 'li_other' });
    await assert.rejects(
      () => refreshLinkedInSessionForDeletion('li_abc', deps),
      (err: unknown) =>
        err instanceof AccountDeletionReauthError && err.code === 'IDENTITY_MISMATCH',
    );
    assert.deepEqual(signIns, []);
    assert.equal(deps.getCurrentUid(), 'li_abc');
  });

  it('cancel / dismiss are silent cancellations', async () => {
    for (const flowStatus of ['cancelled', 'dismissed'] as const) {
      const { deps, signIns } = depsFor({ currentUid: 'li_abc', flowStatus });
      await assert.rejects(
        () => refreshLinkedInSessionForDeletion('li_abc', deps),
        (err: unknown) => err instanceof AccountDeletionReauthError && err.code === 'CANCELLED',
      );
      assert.deepEqual(signIns, []);
    }
  });

  it('expired / provider error / crash fall back to the sign-in-again guidance', async () => {
    for (const input of [
      { flowStatus: 'expired' as const },
      { flowStatus: 'provider_error' as const },
      { flowStatus: 'failed' as const },
      { flowThrows: true },
    ]) {
      const { deps } = depsFor({ currentUid: 'li_abc', ...input });
      await assert.rejects(
        () => refreshLinkedInSessionForDeletion('li_abc', deps),
        (err: unknown) =>
          err instanceof AccountDeletionReauthError &&
          err.code === 'LINKEDIN_SESSION_REQUIRED' &&
          err.messageKey === 'settings.deleteAccount.linkedInSignInAgain',
      );
    }
  });

  it('non-LinkedIn or switched sessions never start the browser flow', async () => {
    for (const [expected, current] of [
      ['firebase-uid', 'firebase-uid'],
      ['li_abc', 'li_other'],
    ]) {
      let flows = 0;
      const { deps } = depsFor({ currentUid: current });
      deps.runFlow = async () => {
        flows += 1;
        return { status: 'cancelled' } as LinkedInA3FlowResult;
      };
      await assert.rejects(() => refreshLinkedInSessionForDeletion(expected, deps));
      assert.equal(flows, 0);
    }
  });

  it('the default runtime runs A3 without durable resume and never fabricates a credential', () => {
    const runtime = fs.readFileSync(
      path.join(__dirname, '..', 'linkedInDeletionReauthRuntime.ts'),
      'utf8',
    );
    assert.match(runtime, /runLinkedInA3BrowserAuthFlow\(\{/);
    assert.doesNotMatch(runtime, /durableStore/);
    const core = fs.readFileSync(path.join(__dirname, '..', 'linkedInDeletionReauth.ts'), 'utf8');
    for (const src of [runtime, core]) {
      assert.doesNotMatch(
        src,
        /new OAuthProvider|reauthenticateWithCredential\(|linkWithCredential\(|from 'firebase\/auth'/,
      );
      assert.doesNotMatch(src, /console\./);
    }
  });
});

describe('Delete Account reauth method selection', () => {
  it('LinkedIn-only account → LinkedIn when the A3 flow is available', () => {
    assert.deepEqual(
      resolveDeletionReauthMethod([], { uid: 'li_abc', linkedInReauthAvailable: true }),
      { kind: 'linkedin' },
    );
  });

  it('LinkedIn-only account without A3 → sign in again (never password)', () => {
    assert.deepEqual(
      resolveDeletionReauthMethod([], { uid: 'li_abc', linkedInReauthAvailable: false }),
      { kind: 'unavailable', reason: 'linkedin_sign_in_again' },
    );
  });

  it('multi-provider: linked methods in priority order, LinkedIn last', () => {
    const methods = resolveDeletionReauthMethods(
      [
        { providerId: 'facebook.com', uid: 'fb1' },
        { providerId: 'google.com', uid: 'g1', email: 'same@mail.test' },
      ],
      { uid: 'li_abc', linkedInReauthAvailable: true },
    );
    assert.deepEqual(
      methods.map((m) => m.kind),
      ['google', 'facebook', 'linkedin'],
    );
    assert.equal(resolveDeletionReauthMethod([{ providerId: 'apple.com', uid: 'a1' }], {
      uid: 'li_abc',
      linkedInReauthAvailable: true,
    }).kind, 'apple');
  });

  it('never infers a provider from the email', () => {
    const methods = resolveDeletionReauthMethods(
      [{ providerId: 'apple.com', uid: 'a1', email: 'someone@gmail.com' }],
      { uid: 'firebase-uid', linkedInReauthAvailable: true },
    );
    assert.deepEqual(methods.map((m) => m.kind), ['apple']);
  });

  it('non-LinkedIn custom-token session stays unavailable', () => {
    assert.deepEqual(resolveDeletionReauthMethod([], { uid: 'firebase-uid' }), {
      kind: 'unavailable',
      reason: 'custom_token_only',
    });
  });
});
