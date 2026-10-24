import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TIKTOK_OWNERSHIP_EXCHANGE,
  TIKTOK_OWNERSHIP_GET,
  TIKTOK_OWNERSHIP_PLATFORM,
  TIKTOK_OWNERSHIP_RETURN_URL,
  TIKTOK_OWNERSHIP_START,
  TIKTOK_OWNERSHIP_UNLINK,
} from '../social/tiktokOwnership/tiktokOwnershipContract.ts';
import {
  mapCallableError,
  parseGetResponse,
  parseStartResponse,
  parseStoredTransaction,
  parseUnlinkResponse,
  parseVerifiedShape,
  serializeStoredTransaction,
  tiktokOwnershipErrorToI18nKey,
  tiktokOwnershipExchange,
  tiktokOwnershipGet,
  tiktokOwnershipStart,
  tiktokOwnershipUnlink,
} from '../social/tiktokOwnership/tiktokOwnershipCore.ts';
import { parseTiktokOwnershipReturnUrl } from '../social/tiktokOwnership/tiktokOwnershipDeepLink.ts';
import {
  createClientProofPair,
  createS256ClientProofChallenge,
  type ClientProofCrypto,
} from '../social/tiktokOwnership/tiktokOwnershipProof.ts';
import {
  buildTiktokOwnershipModeView,
  tiktokOwnershipActionBlocked,
  tiktokOwnershipHandleLabel,
} from '../social/tiktokOwnership/tiktokOwnershipPresentation.ts';

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
  'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUV'; // 58 chars
const VERIFIER_OK = `${VERIFIER}wxyz012345`.slice(0, 64);

function verifiedPayload(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: 'tiktok' as const,
    mode,
    openId: 'tt-open-id-aaaaaaaa',
    canonicalUrl: 'https://www.tiktok.com/@nearsy',
    usernameCache: 'nearsy' as string | null,
    verifiedAt: '2026-10-16T15:00:00.000Z',
  };
}

describe('NEARSY-209 TikTok ownership contract shapes', () => {
  it('exports Identity callables without a channel picker', () => {
    assert.equal(TIKTOK_OWNERSHIP_START, 'tiktokOwnershipStart');
    assert.equal(TIKTOK_OWNERSHIP_EXCHANGE, 'tiktokOwnershipExchange');
    assert.equal(TIKTOK_OWNERSHIP_GET, 'tiktokOwnershipGet');
    assert.equal(TIKTOK_OWNERSHIP_UNLINK, 'tiktokOwnershipUnlink');
    assert.equal(TIKTOK_OWNERSHIP_RETURN_URL, 'nearsy://tiktok-ownership');
    assert.equal(TIKTOK_OWNERSHIP_PLATFORM, 'tiktok');

    const contract = readSrc(
      'social/tiktokOwnership/tiktokOwnershipContract.ts',
    );
    const core = readSrc('social/tiktokOwnership/tiktokOwnershipCore.ts');
    const android = readSrc(
      'social/tiktokOwnership/tiktokOwnership.android.ts',
    );
    assert.doesNotMatch(
      contract,
      /tiktokOwnershipSelectChannel|TIKTOK_OWNERSHIP_SELECT/,
    );
    assert.doesNotMatch(
      core,
      /tiktokOwnershipSelectChannel|TIKTOK_OWNERSHIP_SELECT/,
    );
    assert.doesNotMatch(
      android,
      /tiktokOwnershipSelectChannel|selectTiktokOwnershipChannel/,
    );
    assert.doesNotMatch(core, /publishPersonal\s*:/);
    assert.doesNotMatch(android, /publishPersonal\s*:/);
  });

  it('parses Start with mode echo and rejects prohibited redirect fields', () => {
    const start = parseStartResponse({
      transactionId: 'ABCDEFGHijklmnop',
      mode: 'personal',
      authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize?x=1',
      expiresAt: Date.now() + 60_000,
    });
    assert.equal(start.transactionId, 'ABCDEFGHijklmnop');
    assert.equal(start.mode, 'personal');
    assert.ok(start.authorizationUrl.startsWith('https://'));
    assert.throws(() =>
      parseStartResponse({
        transactionId: 'ABCDEFGHijklmnop',
        mode: 'personal',
        authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize',
        expiresAt: Date.now() + 1,
        redirectUri: 'https://evil.example',
      }),
    );
    assert.throws(() =>
      parseStartResponse({
        transactionId: 'ABCDEFGHijklmnop',
        authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize',
        expiresAt: Date.now() + 1,
      }),
    );
  });

  it('parses verified / get / unlink for both modes', () => {
    for (const mode of ['personal', 'professional'] as const) {
      const verified = verifiedPayload(mode);
      const exchange = parseVerifiedShape(verified);
      assert.equal(exchange.result, 'verified');
      assert.equal(exchange.mode, mode);
      assert.equal(exchange.platform, 'tiktok');
      assert.equal(parseGetResponse(verified).result, 'verified');

      const notLinked = parseGetResponse({
        result: 'not_linked',
        platform: 'tiktok',
        mode,
        linked: false,
      });
      assert.equal(notLinked.result, 'not_linked');
      if (notLinked.result === 'not_linked') {
        assert.equal(notLinked.mode, mode);
      }

      const unlinked = parseUnlinkResponse({
        result: 'unlinked',
        platform: 'tiktok',
        mode,
        unlinked: true,
      });
      assert.equal(unlinked.mode, mode);
      assert.equal(unlinked.unlinked, true);
    }

    assert.throws(() =>
      parseVerifiedShape({
        ...verifiedPayload('personal'),
        openId: '',
      }),
    );
  });

  it('S256 challenge is deterministic base64url', async () => {
    const crypto = nodeCrypto();
    const pair = await createClientProofPair(crypto);
    const again = await createS256ClientProofChallenge(
      crypto,
      pair.clientProofVerifier,
    );
    assert.equal(pair.clientProofChallenge, again);
    assert.equal(pair.clientProofMethod, 'S256');
  });

  it('Start sends mode + android platform + S256 for each editor mode', async () => {
    for (const mode of ['personal', 'professional'] as const) {
      let captured: unknown;
      const functions = {
        region: 'us-central1',
        async call(name: string, data?: unknown) {
          assert.equal(name, TIKTOK_OWNERSHIP_START);
          captured = data;
          return {
            transactionId: 'ABCDEFGHijklmnop',
            mode,
            authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize',
            expiresAt: Date.now() + 60_000,
          };
        },
      };
      const { clientProofVerifier } = await tiktokOwnershipStart(
        functions,
        nodeCrypto(),
        { mode, platform: 'android' },
      );
      const req = captured as {
        mode: string;
        platform: string;
        clientProofChallenge: string;
        clientProofMethod: string;
      };
      assert.deepEqual(Object.keys(req).sort(), [
        'clientProofChallenge',
        'clientProofMethod',
        'mode',
        'platform',
      ]);
      assert.equal(req.mode, mode);
      assert.equal(req.platform, 'android');
      assert.notEqual(req.platform, 'ios');
      assert.equal(req.clientProofMethod, 'S256');
      assert.match(req.clientProofChallenge, /^[A-Za-z0-9_-]{43,128}$/);
      const expected = createHash('sha256')
        .update(clientProofVerifier, 'utf8')
        .digest('base64url');
      assert.equal(req.clientProofChallenge, expected);
      assert.ok(!('url' in req));
      assert.ok(!('redirectUri' in req));
      assert.ok(!('returnUrl' in req));
      assert.ok(!('code_challenge' in req));
    }
  });

  it('Exchange never sends mode', async () => {
    let exchangeBody: unknown;
    await tiktokOwnershipExchange(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, TIKTOK_OWNERSHIP_EXCHANGE);
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

  it('Get and Unlink are mode-scoped and independent across modes', async () => {
    const personalVerified = verifiedPayload('personal');
    const professionalLinked = verifiedPayload('professional');

    let getPersonal: unknown;
    const personalGet = await tiktokOwnershipGet(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, TIKTOK_OWNERSHIP_GET);
          getPersonal = data;
          return personalVerified;
        },
      },
      'personal',
    );
    assert.deepEqual(getPersonal, { mode: 'personal' });
    assert.equal(personalGet.result, 'verified');
    if (personalGet.result === 'verified') {
      assert.equal(personalGet.mode, 'personal');
    }

    let getProfessional: unknown;
    const professionalGet = await tiktokOwnershipGet(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, TIKTOK_OWNERSHIP_GET);
          getProfessional = data;
          return {
            result: 'not_linked',
            platform: 'tiktok',
            mode: 'professional',
            linked: false,
          };
        },
      },
      'professional',
    );
    assert.deepEqual(getProfessional, { mode: 'professional' });
    assert.equal(professionalGet.result, 'not_linked');

    let unlinkPersonal: unknown;
    const unlinked = await tiktokOwnershipUnlink(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, TIKTOK_OWNERSHIP_UNLINK);
          unlinkPersonal = data;
          return {
            result: 'unlinked',
            platform: 'tiktok',
            mode: 'personal',
            unlinked: true,
          };
        },
      },
      'personal',
    );
    assert.deepEqual(unlinkPersonal, { mode: 'personal' });
    assert.equal(unlinked.mode, 'personal');

    const stillProfessional = await tiktokOwnershipGet(
      {
        region: 'us-central1',
        async call(_name, data) {
          assert.deepEqual(data, { mode: 'professional' });
          return professionalLinked;
        },
      },
      'professional',
    );
    assert.equal(stillProfessional.result, 'verified');
    if (stillProfessional.result === 'verified') {
      assert.equal(stillProfessional.mode, 'professional');
    }
  });

  it('stored transaction requires mode and rejects legacy publish-flag payloads', () => {
    const raw = serializeStoredTransaction({
      version: 1,
      transactionId: 'ABCDEFGHijklmnop',
      clientProofVerifier: VERIFIER_OK,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      uid: 'uid_1',
      mode: 'professional',
    });
    const parsed = parseStoredTransaction(raw);
    assert.equal(parsed?.mode, 'professional');

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

  it('maps functions/internal to callable failure, not a network error', () => {
    const mapped = mapCallableError({
      code: 'functions/internal',
      message: 'functions/internal',
    });
    assert.equal(mapped.code, 'CALLABLE_FAILED');
    assert.equal(tiktokOwnershipErrorToI18nKey(mapped.code), 'generic');
    assert.notEqual(mapped.code, 'network');
    assert.notEqual(tiktokOwnershipErrorToI18nKey(mapped.code), 'network');
  });
});

describe('NEARSY-209 TikTok ownership deep link', () => {
  it('accepts success/error with optional mode echo', () => {
    const ok = parseTiktokOwnershipReturnUrl(
      `${TIKTOK_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&mode=personal&result=ok`,
    );
    assert.equal(ok.kind, 'success');
    if (ok.kind === 'success') {
      assert.equal(ok.mode, 'personal');
    }

    const okNoMode = parseTiktokOwnershipReturnUrl(
      `${TIKTOK_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok`,
    );
    assert.equal(okNoMode.kind, 'success');

    const err = parseTiktokOwnershipReturnUrl(
      `${TIKTOK_OWNERSHIP_RETURN_URL}?result=error&error=TX_EXPIRED&mode=professional`,
    );
    assert.equal(err.kind, 'provider_error');
    if (err.kind === 'provider_error') {
      assert.equal(err.errorCode, 'TX_EXPIRED');
      assert.equal(err.mode, 'professional');
    }
  });

  it('rejects oauth secrets, bad mode, and wrong hosts', () => {
    assert.equal(
      parseTiktokOwnershipReturnUrl(
        `${TIKTOK_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok&code=SECRET`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseTiktokOwnershipReturnUrl(
        `${TIKTOK_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok&mode=both`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseTiktokOwnershipReturnUrl(
        'nearsy://youtube-ownership?transactionId=ABCDEFGHijklmnop&result=ok',
      ).kind,
      'unrelated',
    );
  });
});

describe('NEARSY-209 TikTok ownership Android wiring', () => {
  it('SocialMediaScreen uses ownership card and preserves legacy tiktok', () => {
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    assert.match(screen, /TiktokOwnershipCard/);
    assert.match(screen, /legacyUrl=\{draft\.values\.tiktok\}/);
    assert.match(screen, /connected\.tiktok = false/);
    assert.match(screen, /preserveLegacy\('tiktok'\)/);
    assert.match(screen, /mode=\{editorMode/);
    assert.match(screen, /key=\{`tiktok-\$\{editorMode\}`\}/);
    assert.doesNotMatch(screen, /CRJ.*tiktokOwnership|tiktokOwnership.*CRJ/i);
  });

  it('card passes editor mode into Get/Connect/Unlink and blocks while busy', () => {
    const card = readSrc('components/profile/TiktokOwnershipCard.tsx');
    assert.match(card, /mode: ProfileMode/);
    assert.match(card, /requestGenRef/);
    assert.match(card, /getTiktokOwnershipState\(forMode\)/);
    assert.match(card, /connectTiktokOwnership\(forMode\)/);
    assert.match(card, /unlinkTiktokOwnership\(forMode\)/);
    assert.match(card, /forMode/);
    assert.doesNotMatch(card, /selectTiktokOwnershipChannel/);
    assert.doesNotMatch(card, /tiktokOwnershipSelectChannel/);
    assert.doesNotMatch(card, /setTiktokOwnershipPublication/);
    assert.doesNotMatch(card, /publishPersonal|publishProfessional/);
  });

  it('android module never mutates Firebase Auth and always starts with mode + android', () => {
    const android = readSrc(
      'social/tiktokOwnership/tiktokOwnership.android.ts',
    );
    assert.doesNotMatch(
      android,
      /linkWithCredential|signInWithCustomToken|signInWithCredential/,
    );
    assert.match(android, /TIKTOK_OWNERSHIP_MOBILE_PLATFORM_ANDROID/);
    assert.match(android, /mode: scopedMode/);
    assert.match(android, /ensureAppCheckReady/);
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
    assert.doesNotMatch(
      android,
      /console\.(log|warn|error)\([\s\S]{0,80}\bcode\b/,
    );
  });

  it('maps backend errors to i18n keys', () => {
    assert.equal(
      tiktokOwnershipErrorToI18nKey('tiktok-account-claimed'),
      'accountClaimed',
    );
    assert.equal(tiktokOwnershipErrorToI18nKey('tiktok-no-account'), 'noAccount');
    assert.equal(tiktokOwnershipErrorToI18nKey('TX_EXPIRED'), 'txExpired');
    assert.equal(
      tiktokOwnershipErrorToI18nKey('session_changed'),
      'sessionChanged',
    );
    assert.equal(tiktokOwnershipErrorToI18nKey('unknown'), 'generic');
  });

  it('profile i18n includes EN/ES connect/disconnect progress copy', () => {
    const profile = readSrc('i18n/resources/profile.ts');
    assert.match(profile, /tiktokOwnership:/);
    assert.match(profile, /Connect TikTok/);
    assert.match(profile, /Connecting…/);
    assert.match(profile, /Disconnecting…/);
    assert.match(profile, /Conectar TikTok/);
    assert.match(profile, /Conectando…/);
    assert.match(profile, /Desconectando…/);
    assert.doesNotMatch(profile, /publishPersonal|Publish on Personal/);
  });

  it('app scheme nearsy supports tiktok-ownership return without new scheme', () => {
    const appJson = readFileSync(
      path.resolve(root, '../../../apps/nearsy-android/app.json'),
      'utf8',
    );
    assert.match(appJson, /"scheme"\s*:\s*"nearsy"/);
    assert.equal(TIKTOK_OWNERSHIP_RETURN_URL.startsWith('nearsy://'), true);
  });

  it('presentation helpers scope connection to one editor mode', () => {
    assert.equal(tiktokOwnershipActionBlocked('connecting'), true);
    assert.equal(tiktokOwnershipActionBlocked('disconnecting'), true);
    assert.equal(tiktokOwnershipActionBlocked('idle'), false);
    assert.equal(
      tiktokOwnershipHandleLabel({
        usernameCache: 'nearsy',
        canonicalUrl: 'https://www.tiktok.com/@nearsy',
      }),
      '@nearsy',
    );
    const personal = buildTiktokOwnershipModeView({
      mode: 'personal',
      connected: true,
      channelLabel: '@nearsy',
      phase: 'idle',
    });
    assert.equal(personal.mode, 'personal');
    assert.equal(personal.connected, true);
    const professional = buildTiktokOwnershipModeView({
      mode: 'professional',
      connected: false,
      channelLabel: '@nearsy',
      phase: 'idle',
    });
    assert.equal(professional.channelLabel, null);
  });
});
