import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  INSTAGRAM_OWNERSHIP_GET,
  INSTAGRAM_OWNERSHIP_PLATFORM,
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
  INSTAGRAM_OWNERSHIP_START,
  INSTAGRAM_OWNERSHIP_UNLINK,
} from '../social/instagramOwnership/instagramOwnershipContract.ts';
import {
  instagramOwnershipErrorToI18nKey,
  instagramOwnershipGet,
  instagramOwnershipStart,
  instagramOwnershipUnlink,
  mapCallableError,
  parseExpiredResponse,
  parseGetResponse,
  parsePendingResponse,
  parseUnlinkResponse,
} from '../social/instagramOwnership/instagramOwnershipCore.ts';
import {
  presentInstagramGetResponse,
  shouldPollInstagramOwnership,
} from '../social/instagramOwnership/instagramOwnershipPresentation.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

const SAMPLE_CODE = 'AB23CD45';

function pendingPayload(mode: 'personal' | 'professional') {
  return {
    result: 'pending' as const,
    platform: 'instagram' as const,
    mode,
    challengeId: 'ABCDEFGHijklmnop',
    code: SAMPLE_CODE,
    inboxUsername: 'nearsy.app',
    inboxProfileUrl: 'https://www.instagram.com/nearsy.app',
    expiresAt: Date.now() + 15 * 60_000,
  };
}

function verifiedPayload(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: 'instagram' as const,
    mode,
    igsid: '17841478397406342',
    canonicalUrl: 'https://www.instagram.com/nearsy',
    usernameCache: 'nearsy',
    verifiedAt: '2026-10-16T15:00:00.000Z',
  };
}

describe('NEARSY-209 Instagram ownership contract shapes', () => {
  it('exports Start/Get/Unlink without Exchange or Confirm', () => {
    assert.equal(INSTAGRAM_OWNERSHIP_START, 'instagramOwnershipStart');
    assert.equal(INSTAGRAM_OWNERSHIP_GET, 'instagramOwnershipGet');
    assert.equal(INSTAGRAM_OWNERSHIP_UNLINK, 'instagramOwnershipUnlink');
    assert.equal(INSTAGRAM_OWNERSHIP_PLATFORM, 'instagram');
    assert.equal(INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS, 5_000);

    const contract = readSrc(
      'social/instagramOwnership/instagramOwnershipContract.ts',
    );
    const core = readSrc('social/instagramOwnership/instagramOwnershipCore.ts');
    const android = readSrc(
      'social/instagramOwnership/instagramOwnership.android.ts',
    );
    assert.doesNotMatch(contract, /instagramOwnershipExchange|instagramOwnershipConfirm/);
    assert.doesNotMatch(core, /instagramOwnershipExchange|instagramOwnershipConfirm/);
    assert.doesNotMatch(
      android,
      /instagramOwnershipExchange|instagramOwnershipConfirm/,
    );
    assert.doesNotMatch(android, /instagramInboxAuthorizeStart/);
  });

  it('parses pending Start/Get and rejects banned Start fields', async () => {
    for (const mode of ['personal', 'professional'] as const) {
      const pending = parsePendingResponse(pendingPayload(mode));
      assert.equal(pending.result, 'pending');
      assert.equal(pending.mode, mode);
      assert.equal(pending.inboxUsername, 'nearsy.app');
    }
    assert.throws(() =>
      parsePendingResponse({
        ...pendingPayload('personal'),
        inboxUsername: 'other',
      }),
    );

    let captured: unknown;
    await instagramOwnershipStart(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, INSTAGRAM_OWNERSHIP_START);
          captured = data;
          return pendingPayload('personal');
        },
      },
      { mode: 'personal', platform: 'android' },
    );
    const req = captured as Record<string, unknown>;
    assert.deepEqual(Object.keys(req).sort(), ['mode', 'platform']);
    assert.equal(req.mode, 'personal');
    assert.equal(req.platform, 'android');
    assert.notEqual(req.platform, 'ios');
    assert.ok(!('code' in req));
    assert.ok(!('url' in req));
    assert.ok(!('handle' in req));
    assert.ok(!('igsid' in req));
  });

  it('parses verified / expired / conflict / not_linked / unlink', () => {
    for (const mode of ['personal', 'professional'] as const) {
      const verified = parseGetResponse(verifiedPayload(mode));
      assert.equal(verified.result, 'verified');
      if (verified.result === 'verified') {
        assert.equal(verified.mode, mode);
        assert.equal(verified.usernameCache, 'nearsy');
      }

      const expired = parseExpiredResponse({
        result: 'expired',
        platform: 'instagram',
        mode,
        challengeId: 'ABCDEFGHijklmnop',
        expiresAt: Date.now() - 1,
      });
      assert.equal(expired.result, 'expired');
      assert.throws(() =>
        parseExpiredResponse({
          result: 'expired',
          platform: 'instagram',
          mode,
          challengeId: 'ABCDEFGHijklmnop',
          expiresAt: Date.now() - 1,
          code: SAMPLE_CODE,
        }),
      );

      const conflict = parseGetResponse({
        result: 'conflict',
        platform: 'instagram',
        mode,
        reason: 'instagram-account-claimed',
      });
      assert.equal(conflict.result, 'conflict');

      const notLinked = parseGetResponse({
        result: 'not_linked',
        platform: 'instagram',
        mode,
        linked: false,
      });
      assert.equal(notLinked.result, 'not_linked');

      const unlinked = parseUnlinkResponse({
        result: 'unlinked',
        platform: 'instagram',
        mode,
        unlinked: true,
      });
      assert.equal(unlinked.mode, mode);
    }
  });

  it('Get and Unlink are mode-scoped and independent', async () => {
    let getPersonal: unknown;
    const personal = await instagramOwnershipGet(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, INSTAGRAM_OWNERSHIP_GET);
          getPersonal = data;
          return verifiedPayload('personal');
        },
      },
      'personal',
    );
    assert.deepEqual(getPersonal, { mode: 'personal' });
    assert.equal(personal.result, 'verified');

    const professional = await instagramOwnershipGet(
      {
        region: 'us-central1',
        async call(_name, data) {
          assert.deepEqual(data, { mode: 'professional' });
          return {
            result: 'not_linked',
            platform: 'instagram',
            mode: 'professional',
            linked: false,
          };
        },
      },
      'professional',
    );
    assert.equal(professional.result, 'not_linked');

    let unlinkPersonal: unknown;
    const unlinked = await instagramOwnershipUnlink(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, INSTAGRAM_OWNERSHIP_UNLINK);
          unlinkPersonal = data;
          return {
            result: 'unlinked',
            platform: 'instagram',
            mode: 'personal',
            unlinked: true,
          };
        },
      },
      'personal',
    );
    assert.deepEqual(unlinkPersonal, { mode: 'personal' });
    assert.equal(unlinked.mode, 'personal');
  });

  it('maps rate-limit and functions/internal without treating them as network', () => {
    const limited = mapCallableError({
      code: 'functions/resource-exhausted',
      message: 'Too many Instagram verification attempts. (instagram-rate-limited)',
    });
    assert.equal(limited.code, 'instagram-rate-limited');
    assert.equal(instagramOwnershipErrorToI18nKey(limited.code), 'rateLimited');

    const internal = mapCallableError({
      code: 'functions/internal',
      message: 'functions/internal',
    });
    assert.equal(internal.code, 'CALLABLE_FAILED');
    assert.equal(instagramOwnershipErrorToI18nKey(internal.code), 'generic');
    assert.notEqual(internal.code, 'network');
  });
});

describe('NEARSY-209 Instagram ownership polling and presentation', () => {
  it('polls only while pending, focused, active, and unexpired', () => {
    const live = shouldPollInstagramOwnership({
      screenFocused: true,
      appActive: true,
      pending: true,
      nowMs: 1_000,
      expiresAtMs: 6_000,
    });
    assert.equal(live, true);
    assert.equal(
      shouldPollInstagramOwnership({
        screenFocused: false,
        appActive: true,
        pending: true,
        nowMs: 1_000,
        expiresAtMs: 6_000,
      }),
      false,
    );
    assert.equal(
      shouldPollInstagramOwnership({
        screenFocused: true,
        appActive: false,
        pending: true,
        nowMs: 1_000,
        expiresAtMs: 6_000,
      }),
      false,
    );
    assert.equal(
      shouldPollInstagramOwnership({
        screenFocused: true,
        appActive: true,
        pending: false,
        nowMs: 1_000,
        expiresAtMs: 6_000,
      }),
      false,
    );
    assert.equal(
      shouldPollInstagramOwnership({
        screenFocused: true,
        appActive: true,
        pending: true,
        nowMs: 6_000,
        expiresAtMs: 6_000,
      }),
      false,
    );
  });

  it('does not auto-start from expired or conflict Get results', () => {
    const expired = presentInstagramGetResponse({
      result: 'expired',
      platform: 'instagram',
      mode: 'personal',
      challengeId: 'ABCDEFGHijklmnop',
      expiresAt: Date.now() - 1,
    });
    assert.equal(expired.phase, 'idle');
    assert.equal(expired.hint, 'expired');
    assert.equal(expired.challenge, null);

    const conflict = presentInstagramGetResponse({
      result: 'conflict',
      platform: 'instagram',
      mode: 'professional',
      reason: 'instagram-account-claimed',
    });
    assert.equal(conflict.phase, 'idle');
    assert.equal(conflict.hint, 'conflict');
  });
});

describe('NEARSY-209 Instagram ownership Android wiring', () => {
  it('SocialMediaScreen uses ownership card and preserves legacy instagram', () => {
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    assert.match(screen, /InstagramOwnershipCard/);
    assert.match(screen, /legacyUrl=\{draft\.values\.instagram\}/);
    assert.match(screen, /connected\.instagram = false/);
    assert.match(screen, /preserveLegacy\('instagram'\)/);
    assert.doesNotMatch(screen, /instagramInboxAuthorizeStart/);
    assert.doesNotMatch(screen, /Authorize inbox|authorizeInbox/i);
  });

  it('card starts only on explicit action, polls, shares, and unlinks pending', () => {
    const card = readSrc('components/profile/InstagramOwnershipCard.tsx');
    assert.match(card, /startInstagramOwnership\(forMode\)/);
    assert.match(card, /getInstagramOwnershipState\(forMode\)/);
    assert.match(card, /unlinkInstagramOwnership\(forMode\)/);
    assert.match(card, /shouldPollInstagramOwnership/);
    assert.match(card, /INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS/);
    assert.match(card, /AppState/);
    assert.match(card, /Share\.share/);
    assert.match(card, /Linking\.openURL/);
    assert.match(card, /requestGenRef/);
    assert.doesNotMatch(card, /instagramOwnershipExchange/);
    assert.doesNotMatch(card, /instagramInboxAuthorizeStart/);
    assert.doesNotMatch(card, /Authorize inbox/);
    assert.doesNotMatch(
      card,
      /useEffect\([\s\S]{0,200}startInstagramOwnership/,
    );
  });

  it('rate-limited Start shows an error without an automatic retry Start', () => {
    const card = readSrc('components/profile/InstagramOwnershipCard.tsx');
    assert.match(card, /instagram-rate-limited/);
    assert.match(card, /if \(!isRateLimited\)/);
    assert.doesNotMatch(
      card,
      /isRateLimited[\s\S]{0,80}onPress: \(\) => \{\s*void onConnect/,
    );
  });

  it('android module never mutates Firebase Auth and never logs the code', () => {
    const android = readSrc(
      'social/instagramOwnership/instagramOwnership.android.ts',
    );
    assert.doesNotMatch(
      android,
      /linkWithCredential|signInWithCustomToken|signInWithCredential/,
    );
    assert.match(android, /INSTAGRAM_OWNERSHIP_MOBILE_PLATFORM_ANDROID/);
    assert.match(android, /ensureAppCheckReady/);
    assert.doesNotMatch(
      android,
      /console\.(log|warn|error)\([\s\S]{0,80}\bcode\b/,
    );
  });

  it('profile i18n includes EN/ES reverse-DM copy', () => {
    const profile = readSrc('i18n/resources/profile.ts');
    assert.match(profile, /instagramOwnership:/);
    assert.match(profile, /Connect Instagram/);
    assert.match(profile, /Share code/);
    assert.match(profile, /Conectar Instagram/);
    assert.match(profile, /Compartir código/);
    assert.match(profile, /Too many attempts today/);
    assert.match(profile, /Demasiados intentos hoy/);
  });
});
