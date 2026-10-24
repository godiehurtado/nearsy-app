import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  X_OWNERSHIP_EXCHANGE,
  X_OWNERSHIP_GET,
  X_OWNERSHIP_PLATFORM,
  X_OWNERSHIP_RETURN_URL,
  X_OWNERSHIP_START,
  X_OWNERSHIP_UNLINK,
} from '../social/xOwnership/xOwnershipContract.ts';
import {
  mapCallableError,
  parseGetResponse,
  parseStartResponse,
  parseStoredTransaction,
  parseUnlinkResponse,
  parseVerifiedShape,
  serializeStoredTransaction,
  xOwnershipErrorToI18nKey,
  xOwnershipExchange,
  xOwnershipGet,
  xOwnershipStart,
  xOwnershipUnlink,
} from '../social/xOwnership/xOwnershipCore.ts';
import { parseXOwnershipReturnUrl } from '../social/xOwnership/xOwnershipDeepLink.ts';
import { type ClientProofCrypto } from '../social/xOwnership/xOwnershipProof.ts';
import {
  buildXOwnershipModeView,
  xOwnershipActionBlocked,
  xOwnershipManualRetryAllowed,
} from '../social/xOwnership/xOwnershipPresentation.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

function nodeCrypto(): ClientProofCrypto {
  return {
    getRandomBytes: (n) => randomBytes(n),
    sha256: (utf8) => createHash('sha256').update(utf8, 'utf8').digest(),
  };
}

const VERIFIER =
  'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV';
const VERIFIER_OK = `${VERIFIER}wxyz012345`.slice(0, 64);

function verifiedPayload(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: 'x' as const,
    mode,
    userId: '1234567890123456789',
    canonicalUrl: 'https://x.com/nearsyapp',
    usernameCache: 'nearsyapp' as string | null,
    verifiedAt: '2026-10-16T15:00:00.000Z',
  };
}

describe('NEARSY-209 X ownership contract shapes', () => {
  it('exports Identity callables without a channel picker', () => {
    assert.equal(X_OWNERSHIP_START, 'xOwnershipStart');
    assert.equal(X_OWNERSHIP_EXCHANGE, 'xOwnershipExchange');
    assert.equal(X_OWNERSHIP_GET, 'xOwnershipGet');
    assert.equal(X_OWNERSHIP_UNLINK, 'xOwnershipUnlink');
    assert.equal(X_OWNERSHIP_RETURN_URL, 'nearsy://x-ownership');
    assert.equal(X_OWNERSHIP_PLATFORM, 'x');

    const contract = readSrc('social/xOwnership/xOwnershipContract.ts');
    const core = readSrc('social/xOwnership/xOwnershipCore.ts');
    const android = readSrc('social/xOwnership/xOwnership.android.ts');
    assert.doesNotMatch(contract, /xOwnershipSelectChannel|X_OWNERSHIP_SELECT/);
    assert.doesNotMatch(core, /xOwnershipSelectChannel|X_OWNERSHIP_SELECT/);
    assert.doesNotMatch(android, /selectXOwnershipChannel/);
  });

  it('Start sends mode + android platform + S256 and Exchange never sends mode', async () => {
    let startBody: unknown;
    const { clientProofVerifier } = await xOwnershipStart(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, X_OWNERSHIP_START);
          startBody = data;
          return {
            transactionId: 'ABCDEFGHijklmnop',
            mode: 'personal',
            authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
            expiresAt: Date.now() + 10 * 60_000,
          };
        },
      },
      nodeCrypto(),
      { mode: 'personal', platform: 'android' },
    );
    const req = startBody as Record<string, unknown>;
    assert.deepEqual(Object.keys(req).sort(), [
      'clientProofChallenge',
      'clientProofMethod',
      'mode',
      'platform',
    ]);
    assert.equal(req.platform, 'android');
    assert.notEqual(req.platform, 'ios');
    assert.equal(req.clientProofMethod, 'S256');
    assert.ok(!('code_challenge' in req));
    assert.ok(!('codeVerifier' in req));
    const expected = createHash('sha256')
      .update(clientProofVerifier, 'utf8')
      .digest('base64url');
    assert.equal(req.clientProofChallenge, expected);

    let exchangeBody: unknown;
    await xOwnershipExchange(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, X_OWNERSHIP_EXCHANGE);
          exchangeBody = data;
          return verifiedPayload('personal');
        },
      },
      'ABCDEFGHijklmnop',
      VERIFIER_OK,
    );
    assert.deepEqual(Object.keys(exchangeBody as object).sort(), [
      'clientProofVerifier',
      'transactionId',
    ]);
    assert.ok(!('mode' in (exchangeBody as object)));
  });

  it('parses verified / get / unlink and rejects Start PKCE fields', () => {
    const start = parseStartResponse({
      transactionId: 'ABCDEFGHijklmnop',
      mode: 'professional',
      authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
      expiresAt: Date.now() + 1,
    });
    assert.equal(start.mode, 'professional');
    assert.throws(() =>
      parseStartResponse({
        transactionId: 'ABCDEFGHijklmnop',
        mode: 'professional',
        authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
        expiresAt: Date.now() + 1,
        code_challenge: 'abc',
      }),
    );

    const verified = parseVerifiedShape(verifiedPayload('personal'));
    assert.equal(verified.userId, '1234567890123456789');
    assert.equal(parseGetResponse(verifiedPayload('personal')).result, 'verified');
    assert.equal(
      parseUnlinkResponse({
        result: 'unlinked',
        platform: 'x',
        mode: 'personal',
        unlinked: true,
      }).mode,
      'personal',
    );
  });

  it('Get and Unlink stay independent across modes', async () => {
    const personal = await xOwnershipGet(
      {
        region: 'us-central1',
        async call(_name, data) {
          assert.deepEqual(data, { mode: 'personal' });
          return verifiedPayload('personal');
        },
      },
      'personal',
    );
    assert.equal(personal.result, 'verified');
    const professional = await xOwnershipGet(
      {
        region: 'us-central1',
        async call(_name, data) {
          assert.deepEqual(data, { mode: 'professional' });
          return {
            result: 'not_linked',
            platform: 'x',
            mode: 'professional',
            linked: false,
          };
        },
      },
      'professional',
    );
    assert.equal(professional.result, 'not_linked');
    await xOwnershipUnlink(
      {
        region: 'us-central1',
        async call(_name, data) {
          assert.deepEqual(data, { mode: 'personal' });
          return {
            result: 'unlinked',
            platform: 'x',
            mode: 'personal',
            unlinked: true,
          };
        },
      },
      'personal',
    );
  });

  it('does not treat a generic 403 as missing X credits', () => {
    const credits = mapCallableError({
      code: 'functions/failed-precondition',
      message: 'X could not complete this. (x-credits-or-access)',
    });
    assert.equal(credits.code, 'x-credits-or-access');
    assert.equal(xOwnershipErrorToI18nKey(credits.code), 'creditsOrAccess');

    const forbidden = mapCallableError({
      code: 'functions/permission-denied',
      message: 'X blocked this connection. (x-api-forbidden)',
    });
    assert.equal(forbidden.code, 'x-api-forbidden');
    assert.equal(xOwnershipErrorToI18nKey(forbidden.code), 'forbidden');
    assert.notEqual(xOwnershipErrorToI18nKey(forbidden.code), 'creditsOrAccess');

    const generic403 = mapCallableError({
      code: 'functions/permission-denied',
      message: 'Forbidden',
    });
    assert.notEqual(generic403.code, 'x-credits-or-access');
    assert.notEqual(generic403.code, 'X_CREDITS_OR_ACCESS');
    assert.equal(xOwnershipErrorToI18nKey(generic403.code), 'generic');

    const internal = mapCallableError({
      code: 'functions/internal',
      message: 'functions/internal',
    });
    assert.equal(internal.code, 'CALLABLE_FAILED');
    assert.notEqual(internal.code, 'network');
  });

  it('stored transaction requires mode', () => {
    const raw = serializeStoredTransaction({
      version: 1,
      transactionId: 'ABCDEFGHijklmnop',
      clientProofVerifier: VERIFIER_OK,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      uid: 'uid_1',
      mode: 'professional',
    });
    assert.equal(parseStoredTransaction(raw)?.mode, 'professional');
    assert.equal(
      parseStoredTransaction(
        JSON.stringify({
          version: 1,
          transactionId: 'ABCDEFGHijklmnop',
          clientProofVerifier: VERIFIER_OK,
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          uid: 'uid_1',
        }),
      ),
      null,
    );
  });
});

describe('NEARSY-209 X ownership deep link', () => {
  it('accepts success and X-specific callback errors', () => {
    const ok = parseXOwnershipReturnUrl(
      `${X_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&mode=personal&result=ok`,
    );
    assert.equal(ok.kind, 'success');
    for (const error of [
      'X_OAUTH',
      'X_RATE_LIMITED',
      'X_CREDITS_OR_ACCESS',
      'X_FORBIDDEN',
      'TX_EXPIRED',
    ]) {
      const parsed = parseXOwnershipReturnUrl(
        `${X_OWNERSHIP_RETURN_URL}?result=error&error=${error}`,
      );
      assert.equal(parsed.kind, 'provider_error');
      if (parsed.kind === 'provider_error') {
        assert.equal(parsed.errorCode, error);
      }
    }
    assert.equal(
      parseXOwnershipReturnUrl(
        `${X_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok&code=SECRET`,
      ).kind,
      'invalid',
    );
  });
});

describe('NEARSY-209 X ownership Android wiring', () => {
  it('SocialMediaScreen uses ownership card and preserves platform x vs twitter bag', () => {
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    assert.match(screen, /XOwnershipCard/);
    assert.match(screen, /legacyUrl=\{draft\.values\.x\}/);
    assert.match(screen, /connected\.x = false/);
    assert.match(screen, /preserveLegacy\('x'\)/);
    assert.match(screen, /key=\{`x-\$\{editorMode\}`\}/);
    const persist = readSrc('social/onboardingSocialPersistence.ts');
    const catalog = readSrc('social/onboardingSocialCatalog.ts');
    assert.match(catalog, /id: 'x'/);
    assert.match(catalog, /storageKey: 'twitter'/);
    assert.match(persist, /platform\.storageKey/);
  });

  it('card blocks busy state and does not auto-retry OAuth/credit errors', () => {
    const card = readSrc('components/profile/XOwnershipCard.tsx');
    assert.match(card, /connectXOwnership\(forMode\)/);
    assert.match(card, /getXOwnershipState\(forMode\)/);
    assert.match(card, /unlinkXOwnership\(forMode\)/);
    assert.match(card, /xOwnershipManualRetryAllowed/);
    assert.doesNotMatch(card, /selectXOwnershipChannel/);
    assert.equal(xOwnershipManualRetryAllowed('X_RATE_LIMITED'), false);
    assert.equal(xOwnershipManualRetryAllowed('X_CREDITS_OR_ACCESS'), false);
    assert.equal(xOwnershipManualRetryAllowed('X_FORBIDDEN'), false);
    assert.equal(xOwnershipManualRetryAllowed('X_OAUTH'), false);
    assert.equal(xOwnershipManualRetryAllowed('TX_INVALID'), true);
  });

  it('android module never mutates Firebase Auth and never logs secrets', () => {
    const android = readSrc('social/xOwnership/xOwnership.android.ts');
    assert.doesNotMatch(
      android,
      /linkWithCredential|signInWithCustomToken|signInWithCredential/,
    );
    assert.match(android, /X_OWNERSHIP_MOBILE_PLATFORM_ANDROID/);
    assert.match(android, /openAuthSession/);
    assert.doesNotMatch(android, /ASWebAuthenticationSession/);
    assert.doesNotMatch(
      android,
      /console\.(log|warn|error)\([\s\S]{0,120}authorizationUrl/,
    );
    assert.doesNotMatch(
      android,
      /console\.(log|warn|error)\([\s\S]{0,120}clientProofVerifier/,
    );
    assert.doesNotMatch(android, /X_OAUTH_CLIENT_ID|CLIENT_SECRET/);
  });

  it('i18n and presentation cover X-specific errors', () => {
    const profile = readSrc('i18n/resources/profile.ts');
    assert.match(profile, /xOwnership:/);
    assert.match(profile, /Connect X/);
    assert.match(profile, /Conectar X/);
    assert.match(profile, /creditsOrAccess/);
    assert.equal(xOwnershipErrorToI18nKey('x-credits-or-access'), 'creditsOrAccess');
    assert.equal(xOwnershipErrorToI18nKey('X_FORBIDDEN'), 'forbidden');
    assert.equal(xOwnershipActionBlocked('connecting'), true);
    const professional = buildXOwnershipModeView({
      mode: 'professional',
      connected: false,
      channelLabel: '@nearsyapp',
      phase: 'idle',
    });
    assert.equal(professional.channelLabel, null);
  });
});
