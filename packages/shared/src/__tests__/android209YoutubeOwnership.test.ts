import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  YOUTUBE_OWNERSHIP_EXCHANGE,
  YOUTUBE_OWNERSHIP_GET,
  YOUTUBE_OWNERSHIP_PLATFORM,
  YOUTUBE_OWNERSHIP_RETURN_URL,
  YOUTUBE_OWNERSHIP_SELECT_CHANNEL,
  YOUTUBE_OWNERSHIP_START,
  YOUTUBE_OWNERSHIP_UNLINK,
} from '../social/youtubeOwnership/youtubeOwnershipContract.ts';
import {
  parseExchangeResponse,
  parseGetResponse,
  parseStartResponse,
  parseStoredTransaction,
  parseUnlinkResponse,
  serializeStoredTransaction,
  youtubeOwnershipErrorToI18nKey,
  youtubeOwnershipExchange,
  youtubeOwnershipGet,
  youtubeOwnershipSelectChannel,
  youtubeOwnershipStart,
  youtubeOwnershipUnlink,
} from '../social/youtubeOwnership/youtubeOwnershipCore.ts';
import { parseYoutubeOwnershipReturnUrl } from '../social/youtubeOwnership/youtubeOwnershipDeepLink.ts';
import {
  createClientProofPair,
  createS256ClientProofChallenge,
  type ClientProofCrypto,
} from '../social/youtubeOwnership/youtubeOwnershipProof.ts';
import {
  buildYoutubeOwnershipModeView,
  youtubeOwnershipActionBlocked,
} from '../social/youtubeOwnership/youtubeOwnershipPresentation.ts';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

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
    platform: 'youtube' as const,
    mode,
    channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    canonicalUrl: 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx',
    customUrlCache: null as string | null,
    verifiedAt: '2026-10-16T15:00:00.000Z',
  };
}

describe('NEARSY-209 YouTube ownership contract shapes', () => {
  it('exports Identity callable names without SetPublication', () => {
    assert.equal(YOUTUBE_OWNERSHIP_START, 'youtubeOwnershipStart');
    assert.equal(YOUTUBE_OWNERSHIP_EXCHANGE, 'youtubeOwnershipExchange');
    assert.equal(
      YOUTUBE_OWNERSHIP_SELECT_CHANNEL,
      'youtubeOwnershipSelectChannel',
    );
    assert.equal(YOUTUBE_OWNERSHIP_GET, 'youtubeOwnershipGet');
    assert.equal(YOUTUBE_OWNERSHIP_UNLINK, 'youtubeOwnershipUnlink');
    assert.equal(YOUTUBE_OWNERSHIP_RETURN_URL, 'nearsy://youtube-ownership');
    assert.equal(YOUTUBE_OWNERSHIP_PLATFORM, 'youtube');

    const contract = readSrc(
      'social/youtubeOwnership/youtubeOwnershipContract.ts',
    );
    const core = readSrc('social/youtubeOwnership/youtubeOwnershipCore.ts');
    const android = readSrc(
      'social/youtubeOwnership/youtubeOwnership.android.ts',
    );
    assert.doesNotMatch(
      contract,
      /YOUTUBE_OWNERSHIP_SET_PUBLICATION|youtubeOwnershipSetPublication/,
    );
    assert.doesNotMatch(
      core,
      /youtubeOwnershipSetPublication|parseSetPublicationResponse/,
    );
    assert.doesNotMatch(
      android,
      /setYoutubeOwnershipPublication|youtubeOwnershipSetPublication/,
    );
    assert.doesNotMatch(core, /publishPersonal\s*:/);
    assert.doesNotMatch(android, /publishPersonal\s*:/);
  });

  it('parses Start with mode echo and rejects prohibited redirect fields', () => {
    const start = parseStartResponse({
      transactionId: 'ABCDEFGHijklmnop',
      mode: 'personal',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      expiresAt: Date.now() + 60_000,
    });
    assert.equal(start.transactionId, 'ABCDEFGHijklmnop');
    assert.equal(start.mode, 'personal');
    assert.ok(start.authorizationUrl.startsWith('https://'));
    assert.throws(() =>
      parseStartResponse({
        transactionId: 'ABCDEFGHijklmnop',
        mode: 'personal',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        expiresAt: Date.now() + 1,
        redirectUri: 'https://evil.example',
      }),
    );
    assert.throws(() =>
      parseStartResponse({
        transactionId: 'ABCDEFGHijklmnop',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        expiresAt: Date.now() + 1,
      }),
    );
  });

  it('parses verified / select_channel / get / unlink for both modes', () => {
    for (const mode of ['personal', 'professional'] as const) {
      const verified = verifiedPayload(mode);
      const exchange = parseExchangeResponse(verified);
      assert.equal(exchange.result, 'verified');
      if (exchange.result === 'verified') {
        assert.equal(exchange.mode, mode);
        assert.equal(exchange.platform, 'youtube');
      }
      assert.equal(parseGetResponse(verified).result, 'verified');

      const notLinked = parseGetResponse({
        result: 'not_linked',
        platform: 'youtube',
        mode,
        linked: false,
      });
      assert.equal(notLinked.result, 'not_linked');
      if (notLinked.result === 'not_linked') {
        assert.equal(notLinked.mode, mode);
      }

      const unlinked = parseUnlinkResponse({
        result: 'unlinked',
        platform: 'youtube',
        mode,
        unlinked: true,
      });
      assert.equal(unlinked.mode, mode);
      assert.equal(unlinked.unlinked, true);

      const select = parseExchangeResponse({
        result: 'select_channel',
        platform: 'youtube',
        mode,
        transactionId: 'ABCDEFGHijklmnop',
        channels: [
          {
            channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
            title: 'A',
            customUrlCache: 'handleA',
            canonicalUrl: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',
          },
        ],
      });
      assert.equal(select.result, 'select_channel');
      if (select.result === 'select_channel') {
        assert.equal(select.mode, mode);
        assert.equal(select.channels[0]?.customUrlCache, 'handleA');
      }
    }

    assert.throws(() =>
      parseExchangeResponse({
        ...verifiedPayload('personal'),
        publishPersonal: true,
        publishProfessional: false,
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
          assert.equal(name, YOUTUBE_OWNERSHIP_START);
          captured = data;
          return {
            transactionId: 'ABCDEFGHijklmnop',
            mode,
            authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            expiresAt: Date.now() + 60_000,
          };
        },
      };
      const { clientProofVerifier } = await youtubeOwnershipStart(
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
      assert.notEqual(req.platform, 'youtube');
      assert.equal(req.clientProofMethod, 'S256');
      assert.match(req.clientProofChallenge, /^[A-Za-z0-9_-]{43,128}$/);
      const expected = createHash('sha256')
        .update(clientProofVerifier, 'utf8')
        .digest('base64url');
      assert.equal(req.clientProofChallenge, expected);
      assert.ok(!('url' in req));
      assert.ok(!('redirectUri' in req));
      assert.ok(!('returnUrl' in req));
      assert.ok(!('channelUrl' in req));
    }
  });

  it('Exchange and SelectChannel never send mode', async () => {
    let exchangeBody: unknown;
    await youtubeOwnershipExchange(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, YOUTUBE_OWNERSHIP_EXCHANGE);
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

    let selectBody: unknown;
    await youtubeOwnershipSelectChannel(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, YOUTUBE_OWNERSHIP_SELECT_CHANNEL);
          selectBody = data;
          return verifiedPayload('professional');
        },
      },
      'ABCDEFGHijklmnop',
      'UCbbbbbbbbbbbbbbbbbbbbbb',
    );
    assert.deepEqual(Object.keys(selectBody as object).sort(), [
      'channelId',
      'transactionId',
    ]);
    assert.ok(!('mode' in (selectBody as object)));
  });

  it('Get and Unlink are mode-scoped and independent across modes', async () => {
    const personalVerified = verifiedPayload('personal');
    const professionalLinked = verifiedPayload('professional');

    let getPersonal: unknown;
    const personalGet = await youtubeOwnershipGet(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, YOUTUBE_OWNERSHIP_GET);
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
    const professionalGet = await youtubeOwnershipGet(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, YOUTUBE_OWNERSHIP_GET);
          getProfessional = data;
          return {
            result: 'not_linked',
            platform: 'youtube',
            mode: 'professional',
            linked: false,
          };
        },
      },
      'professional',
    );
    assert.deepEqual(getProfessional, { mode: 'professional' });
    assert.equal(professionalGet.result, 'not_linked');
    if (professionalGet.result === 'not_linked') {
      assert.equal(professionalGet.mode, 'professional');
    }

    // Unlink personal must not imply professional state changes client-side.
    let unlinkPersonal: unknown;
    const unlinked = await youtubeOwnershipUnlink(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, YOUTUBE_OWNERSHIP_UNLINK);
          unlinkPersonal = data;
          return {
            result: 'unlinked',
            platform: 'youtube',
            mode: 'personal',
            unlinked: true,
          };
        },
      },
      'personal',
    );
    assert.deepEqual(unlinkPersonal, { mode: 'personal' });
    assert.equal(unlinked.mode, 'personal');

    const stillProfessional = await youtubeOwnershipGet(
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
});

describe('NEARSY-209 YouTube ownership deep link', () => {
  it('accepts success/error with optional mode echo', () => {
    const ok = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&mode=personal&result=ok`,
    );
    assert.equal(ok.kind, 'success');
    if (ok.kind === 'success') {
      assert.equal(ok.mode, 'personal');
    }

    const okNoMode = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok`,
    );
    assert.equal(okNoMode.kind, 'success');

    const err = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?result=error&error=TX_EXPIRED&mode=professional`,
    );
    assert.equal(err.kind, 'provider_error');
    if (err.kind === 'provider_error') {
      assert.equal(err.errorCode, 'TX_EXPIRED');
      assert.equal(err.mode, 'professional');
    }
  });

  it('rejects oauth secrets, bad mode, and wrong hosts', () => {
    assert.equal(
      parseYoutubeOwnershipReturnUrl(
        `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok&code=SECRET`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseYoutubeOwnershipReturnUrl(
        `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=ABCDEFGHijklmnop&result=ok&mode=both`,
      ).kind,
      'invalid',
    );
    assert.equal(
      parseYoutubeOwnershipReturnUrl(
        'nearsy://linkedin-auth?transactionId=ABCDEFGHijklmnop&result=ok',
      ).kind,
      'unrelated',
    );
  });
});

describe('NEARSY-209 YouTube ownership Android wiring', () => {
  it('SocialMediaScreen uses ownership card and preserves legacy youtube', () => {
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    assert.match(screen, /YoutubeOwnershipCard/);
    assert.match(screen, /legacyYoutube/);
    assert.match(screen, /connected\.youtube = false/);
    assert.match(screen, /mode=\{editorMode/);
    assert.match(screen, /key=\{`youtube-\$\{editorMode\}`\}/);
    assert.doesNotMatch(screen, /CRJ.*youtubeOwnership|youtubeOwnership.*CRJ/i);
  });

  it('card passes editor mode into Get/Connect/Unlink and blocks while busy', () => {
    const card = readSrc('components/profile/YoutubeOwnershipCard.tsx');
    assert.match(card, /mode: ProfileMode/);
    assert.match(card, /requestGenRef/);
    assert.match(card, /getYoutubeOwnershipState\(forMode\)/);
    assert.match(card, /connectYoutubeOwnership\(forMode\)/);
    assert.match(card, /unlinkYoutubeOwnership\(forMode\)/);
    assert.match(card, /selectYoutubeOwnershipChannel\(/);
    assert.match(card, /forMode/);
    assert.match(card, /Connecting|connecting|Connect YouTube|connect/);
    assert.doesNotMatch(card, /setYoutubeOwnershipPublication/);
    assert.doesNotMatch(card, /\bSwitch\b/);
    assert.doesNotMatch(card, /publishPersonal|publishProfessional/);
  });

  it('android module never mutates Firebase Auth and always starts with mode + android', () => {
    const android = readSrc(
      'social/youtubeOwnership/youtubeOwnership.android.ts',
    );
    assert.doesNotMatch(
      android,
      /linkWithCredential|signInWithCustomToken|signInWithCredential/,
    );
    assert.match(android, /YOUTUBE_OWNERSHIP_MOBILE_PLATFORM_ANDROID/);
    assert.match(android, /mode: scopedMode/);
    assert.match(android, /ensureAppCheckReady/);
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
      youtubeOwnershipErrorToI18nKey('youtube-channel-claimed'),
      'channelClaimed',
    );
    assert.equal(youtubeOwnershipErrorToI18nKey('TX_EXPIRED'), 'txExpired');
    assert.equal(
      youtubeOwnershipErrorToI18nKey('session_changed'),
      'sessionChanged',
    );
    assert.equal(youtubeOwnershipErrorToI18nKey('unknown'), 'generic');
  });

  it('profile i18n includes EN/ES connect/disconnect progress copy', () => {
    const profile = readSrc('i18n/resources/profile.ts');
    assert.match(profile, /youtubeOwnership:/);
    assert.match(profile, /Connect YouTube/);
    assert.match(profile, /Connecting…/);
    assert.match(profile, /Disconnecting…/);
    assert.match(profile, /Conectar YouTube/);
    assert.match(profile, /Conectando…/);
    assert.match(profile, /Desconectando…/);
    assert.doesNotMatch(profile, /publishPersonal|Publish on Personal/);
    assert.doesNotMatch(
      profile,
      /según las reglas del servidor|according to server/i,
    );
  });

  it('app scheme nearsy supports youtube-ownership return without new scheme', () => {
    const appJson = readFileSync(
      path.resolve(root, '../../../apps/nearsy-android/app.json'),
      'utf8',
    );
    assert.match(appJson, /"scheme"\s*:\s*"nearsy"/);
    assert.equal(YOUTUBE_OWNERSHIP_RETURN_URL.startsWith('nearsy://'), true);
  });

  it('presentation helpers scope connection to one editor mode', () => {
    assert.equal(youtubeOwnershipActionBlocked('connecting'), true);
    assert.equal(youtubeOwnershipActionBlocked('disconnecting'), true);
    assert.equal(youtubeOwnershipActionBlocked('idle'), false);
    const personal = buildYoutubeOwnershipModeView({
      mode: 'personal',
      connected: true,
      channelLabel: 'https://www.youtube.com/@demo',
      phase: 'idle',
    });
    assert.equal(personal.mode, 'personal');
    assert.equal(personal.connected, true);
    const professional = buildYoutubeOwnershipModeView({
      mode: 'professional',
      connected: false,
      channelLabel: 'https://www.youtube.com/@demo',
      phase: 'idle',
    });
    assert.equal(professional.channelLabel, null);
  });
});

