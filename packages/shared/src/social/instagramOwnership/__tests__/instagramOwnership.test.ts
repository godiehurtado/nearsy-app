import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FirebaseCallableHttpError } from '../../../firebase/callableHttp';
import { createInstagramOwnershipCallableClient } from '../client';
import { mapInstagramOwnershipThrowable } from '../errors';
import {
  omitInstagramFromDraftValues,
  preserveLegacyInstagramInSocialPatch,
} from '../legacyInstagramPreserve';
import {
  INSTAGRAM_OWNERSHIP_CALLABLE_NAMES,
  INSTAGRAM_OWNERSHIP_PLATFORM,
} from '../names';
import { presentInstagramGetResponse } from '../instagramGetPresentation';
import {
  assertInstagramInboxAuthorizeStartRequest,
  assertInstagramInboxAuthorizeStartResponse,
  assertInstagramOwnershipGetResponse,
  assertInstagramOwnershipStartRequest,
  assertInstagramOwnershipStartResponse,
  assertInstagramOwnershipUnlinked,
  assertInstagramOwnershipVerified,
} from '../parse';
import {
  INSTAGRAM_INBOX_PRODUCTION_OWNER_UID,
  INSTAGRAM_INBOX_PRODUCTION_PROJECT_ID,
  shouldShowInstagramInboxAuthorizeOwnerAction,
} from '../inboxAuthorizeOwnerGate';
import { openInstagramInboxAuthorizationUrl } from '../openInboxAuthorization';
import {
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
  shouldPollInstagramOwnership,
} from '../pollPolicy';

const CHALLENGE_ID = 'ch_abcdefghijklmnop';
const CODE = 'AB23CD45';

function pendingForMode(mode: 'personal' | 'professional') {
  return {
    result: 'pending' as const,
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    challengeId: CHALLENGE_ID,
    code: CODE,
    inboxUsername: 'nearsy.app',
    inboxProfileUrl: 'https://www.instagram.com/nearsy.app',
    expiresAt: 1710000000000,
  };
}

function verifiedForMode(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: INSTAGRAM_OWNERSHIP_PLATFORM,
    mode,
    igsid: '17841400000000001',
    canonicalUrl: 'https://www.instagram.com/nearsy_user',
    usernameCache: 'nearsy_user',
    verifiedAt: '2026-10-21T00:00:00.000Z',
  };
}

describe('instagram ownership parse', () => {
  it('accepts Start request with mode and platform ios|android', () => {
    const req = assertInstagramOwnershipStartRequest({
      mode: 'professional',
      platform: 'ios',
    });
    assert.equal(req.mode, 'professional');
    assert.equal(req.platform, 'ios');
  });

  it('rejects Start platform instagram and forbidden client fields', () => {
    assert.throws(() =>
      assertInstagramOwnershipStartRequest({
        mode: 'personal',
        platform: 'instagram',
      }),
    );
    for (const field of [
      'code',
      'handle',
      'username',
      'igsid',
      'url',
      'profileUrl',
      'redirectUri',
      'returnUrl',
    ]) {
      assert.throws(() =>
        assertInstagramOwnershipStartRequest({
          mode: 'personal',
          platform: 'ios',
          [field]: 'x',
        }),
      );
    }
  });

  it('parses Start pending with epoch expiresAt and inbox URL matching username', () => {
    const start = assertInstagramOwnershipStartResponse(
      pendingForMode('personal'),
    );
    assert.equal(start.result, 'pending');
    assert.equal(start.inboxUsername, 'nearsy.app');
    assert.equal(start.expiresAt, 1710000000000);

    assert.throws(() =>
      assertInstagramOwnershipStartResponse({
        ...pendingForMode('personal'),
        inboxUsername: 'other',
      }),
    );
  });

  it('parses Get pending, verified, expired, conflict, and not_linked', () => {
    const pending = assertInstagramOwnershipGetResponse(
      pendingForMode('professional'),
    );
    assert.equal(pending.result, 'pending');

    const verified = assertInstagramOwnershipGetResponse(
      verifiedForMode('personal'),
    );
    assert.equal(verified.result, 'verified');

    const expired = assertInstagramOwnershipGetResponse({
      result: 'expired',
      platform: 'instagram',
      mode: 'personal',
      challengeId: CHALLENGE_ID,
      expiresAt: 1710000000000,
    });
    assert.equal(expired.result, 'expired');
    assert.throws(() =>
      assertInstagramOwnershipGetResponse({
        result: 'expired',
        platform: 'instagram',
        mode: 'personal',
        challengeId: CHALLENGE_ID,
        expiresAt: 1710000000000,
        code: CODE,
      }),
    );

    const conflict = assertInstagramOwnershipGetResponse({
      result: 'conflict',
      platform: 'instagram',
      mode: 'personal',
      reason: 'instagram-account-claimed',
    });
    assert.equal(conflict.result, 'conflict');

    const notLinked = assertInstagramOwnershipGetResponse({
      result: 'not_linked',
      platform: 'instagram',
      mode: 'professional',
      linked: false,
    });
    assert.equal(notLinked.result, 'not_linked');
  });

  it('maps the five Get results without implying auto-Start', () => {
    assert.equal(
      presentInstagramGetResponse(pendingForMode('personal')).phase,
      'pending',
    );
    assert.equal(
      presentInstagramGetResponse(verifiedForMode('personal')).verified
        ?.result,
      'verified',
    );
    const expired = presentInstagramGetResponse({
      result: 'expired',
      platform: 'instagram',
      mode: 'personal',
      challengeId: CHALLENGE_ID,
      expiresAt: 1710000000000,
    });
    assert.equal(expired.hint, 'expired');
    assert.equal(expired.challenge, null);
    assert.equal(expired.alertCode, 'TX_EXPIRED');
    const conflict = presentInstagramGetResponse({
      result: 'conflict',
      platform: 'instagram',
      mode: 'personal',
      reason: 'instagram-account-claimed',
    });
    assert.equal(conflict.hint, 'conflict');
    assert.equal(conflict.alertCode, 'INSTAGRAM_ACCOUNT_CLAIMED');
    const idle = presentInstagramGetResponse({
      result: 'not_linked',
      platform: 'instagram',
      mode: 'personal',
      linked: false,
    });
    assert.equal(idle.hint, null);
    assert.equal(idle.needsRetry, false);
  });

  it('rejects Get exchange-like bodies', () => {
    assert.throws(() =>
      assertInstagramOwnershipGetResponse({
        result: 'exchange',
        platform: 'instagram',
        mode: 'personal',
      }),
    );
  });
});

describe('instagram ownership callable client', () => {
  it('Start sends only mode and ios platform; Get/Unlink send mode; no Exchange', async () => {
    const calls: Array<{ name: string; data: Record<string, unknown> }> = [];
    const client = createInstagramOwnershipCallableClient(async (name, data) => {
      calls.push({ name, data });
      if (name === INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.start) {
        return pendingForMode(data.mode as 'personal');
      }
      if (name === INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.get) {
        return {
          result: 'not_linked',
          platform: 'instagram',
          mode: data.mode,
          linked: false,
        };
      }
      if (name === INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.unlink) {
        return {
          result: 'unlinked',
          platform: 'instagram',
          mode: data.mode,
          unlinked: true,
        };
      }
      throw new Error(`unexpected ${name}`);
    });

    await client.start({ mode: 'personal', platform: 'ios' });
    await client.get('professional');
    await client.unlink('professional');

    assert.deepEqual(calls[0], {
      name: INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.start,
      data: { mode: 'personal', platform: 'ios' },
    });
    assert.equal('code' in calls[0]!.data, false);
    assert.equal('igsid' in calls[0]!.data, false);
    assert.deepEqual(calls[1], {
      name: INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.get,
      data: { mode: 'professional' },
    });
    assert.deepEqual(calls[2], {
      name: INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.unlink,
      data: { mode: 'professional' },
    });
    assert.equal(
      'exchange' in INSTAGRAM_OWNERSHIP_CALLABLE_NAMES ||
        'confirm' in INSTAGRAM_OWNERSHIP_CALLABLE_NAMES,
      false,
    );
  });

  it('inboxAuthorizeStart sends empty body and parses Instagram Login URL', async () => {
    const calls: Array<{ name: string; data: Record<string, unknown> }> = [];
    const client = createInstagramOwnershipCallableClient(async (name, data) => {
      calls.push({ name, data });
      if (name === INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.inboxAuthorizeStart) {
        return {
          authorizationUrl:
            'https://www.instagram.com/oauth/authorize?client_id=1&redirect_uri=https://example.invalid/cb',
        };
      }
      throw new Error(`unexpected ${name}`);
    });
    const started = await client.startInboxAuthorize();
    assert.deepEqual(calls[0], {
      name: 'instagramInboxAuthorizeStart',
      data: {},
    });
    assert.equal('code' in calls[0]!.data, false);
    assert.equal('token' in calls[0]!.data, false);
    assert.match(started.authorizationUrl, /^https:\/\/www\.instagram\.com\/oauth\/authorize/);
  });
});

describe('instagram inbox authorize parse', () => {
  it('rejects non-empty Start payload and non-Instagram URLs', () => {
    assert.deepEqual(assertInstagramInboxAuthorizeStartRequest({}), {});
    assert.throws(() =>
      assertInstagramInboxAuthorizeStartRequest({ mode: 'personal' }),
    );
    assert.throws(() =>
      assertInstagramInboxAuthorizeStartRequest({ code: 'AB23CD45' }),
    );
    assert.throws(() =>
      assertInstagramInboxAuthorizeStartResponse({
        authorizationUrl: 'http://www.instagram.com/oauth/authorize',
      }),
    );
    assert.throws(() =>
      assertInstagramInboxAuthorizeStartResponse({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      }),
    );
    assert.ok(
      assertInstagramInboxAuthorizeStartResponse({
        authorizationUrl:
          'https://www.instagram.com/oauth/authorize?client_id=1',
      }).authorizationUrl.startsWith('https://www.instagram.com/oauth/authorize'),
    );
  });
});

describe('instagram ownership error mapping', () => {
  it('maps public Instagram tokens and functions/internal to UNKNOWN not NETWORK', () => {
    assert.equal(
      mapInstagramOwnershipThrowable(new Error('(instagram-not-enabled)'))
        .code,
      'INSTAGRAM_NOT_ENABLED',
    );
    assert.equal(
      mapInstagramOwnershipThrowable(
        new Error('(instagram-account-claimed)'),
      ).code,
      'INSTAGRAM_ACCOUNT_CLAIMED',
    );
    assert.equal(
      mapInstagramOwnershipThrowable(new Error('(instagram-rate-limited)'))
        .code,
      'INSTAGRAM_RATE_LIMITED',
    );
    const exhausted = mapInstagramOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/resource-exhausted',
        message: 'Too many Instagram verification attempts. (instagram-rate-limited)',
      }),
    );
    assert.equal(exhausted.code, 'INSTAGRAM_RATE_LIMITED');
    assert.equal(exhausted.retryable, false);
    const exhaustedBare = mapInstagramOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/resource-exhausted',
        message: 'RESOURCE_EXHAUSTED',
      }),
    );
    assert.equal(exhaustedBare.code, 'INSTAGRAM_RATE_LIMITED');
    assert.equal(exhaustedBare.retryable, false);
    const internal = mapInstagramOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/internal',
        message: 'INTERNAL',
      }),
    );
    assert.equal(internal.code, 'UNKNOWN');
    assert.equal(internal.wireCode, 'functions/internal');
  });
});

describe('legacy instagram preserve', () => {
  it('omits instagram from draft values and preserves legacy in patch', () => {
    const omitted = omitInstagramFromDraftValues({
      instagram: 'https://www.instagram.com/x',
      tiktok: 'ada',
    });
    assert.equal('instagram' in omitted, false);
    assert.equal(omitted.tiktok, 'ada');

    const patch = preserveLegacyInstagramInSocialPatch(
      'personal',
      {
        socialLinksPersonal: { tiktok: 'https://www.tiktok.com/@ada' },
      },
      { instagram: 'https://www.instagram.com/legacy' },
    );
    assert.equal(
      patch.socialLinksPersonal?.instagram,
      'https://www.instagram.com/legacy',
    );
  });
});

describe('instagram verified shape', () => {
  it('rejects canonical/username mismatch and accepts unlink', () => {
    assert.throws(() =>
      assertInstagramOwnershipVerified({
        ...verifiedForMode('personal'),
        usernameCache: 'other_user',
      }),
    );
    assert.equal(
      assertInstagramOwnershipUnlinked({
        result: 'unlinked',
        platform: 'instagram',
        mode: 'personal',
        unlinked: true,
      }).unlinked,
      true,
    );
  });
});

describe('instagram poll policy', () => {
  it('polls only while pending, on-screen, and unexpired', () => {
    assert.equal(INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS, 5_000);
    assert.equal(
      shouldPollInstagramOwnership({
        screenActive: true,
        pending: true,
        nowMs: 1_000,
        expiresAtMs: 10_000,
      }),
      true,
    );
    assert.equal(
      shouldPollInstagramOwnership({
        screenActive: false,
        pending: true,
        nowMs: 1_000,
        expiresAtMs: 10_000,
      }),
      false,
    );
    assert.equal(
      shouldPollInstagramOwnership({
        screenActive: true,
        pending: false,
        nowMs: 1_000,
        expiresAtMs: 10_000,
      }),
      false,
    );
    assert.equal(
      shouldPollInstagramOwnership({
        screenActive: true,
        pending: true,
        nowMs: 10_000,
        expiresAtMs: 10_000,
      }),
      false,
    );
  });
});

describe('instagram inbox authorize production Owner gate', () => {
  const owner = {
    platform: 'ios',
    firebaseEnvironment: 'production',
    firebaseProjectId: INSTAGRAM_INBOX_PRODUCTION_PROJECT_ID,
    uid: INSTAGRAM_INBOX_PRODUCTION_OWNER_UID,
  };

  it('shows only for the production Owner on iOS nearsy-pj', () => {
    assert.equal(shouldShowInstagramInboxAuthorizeOwnerAction(owner), true);
    assert.equal(INSTAGRAM_INBOX_PRODUCTION_OWNER_UID, 'ATuSeZ1dR7dtMUUo0FWzcy7seO43');
    assert.equal(INSTAGRAM_INBOX_PRODUCTION_PROJECT_ID, 'nearsy-pj');
  });

  it('hides for other users, development, and other projects', () => {
    assert.equal(
      shouldShowInstagramInboxAuthorizeOwnerAction({
        ...owner,
        uid: 'someone-else',
      }),
      false,
    );
    assert.equal(
      shouldShowInstagramInboxAuthorizeOwnerAction({
        ...owner,
        uid: null,
      }),
      false,
    );
    assert.equal(
      shouldShowInstagramInboxAuthorizeOwnerAction({
        ...owner,
        platform: 'android',
      }),
      false,
    );
    assert.equal(
      shouldShowInstagramInboxAuthorizeOwnerAction({
        ...owner,
        firebaseEnvironment: 'development',
      }),
      false,
    );
    assert.equal(
      shouldShowInstagramInboxAuthorizeOwnerAction({
        ...owner,
        firebaseProjectId: 'nearsy-dev',
      }),
      false,
    );
    assert.equal(
      shouldShowInstagramInboxAuthorizeOwnerAction({
        ...owner,
        firebaseProjectId: '',
      }),
      false,
    );
  });
});

describe('instagram inbox authorize open URL', () => {
  it('opens a validated Instagram authorize URL without logging it', async () => {
    const opened: string[] = [];
    await openInstagramInboxAuthorizationUrl(
      'https://www.instagram.com/oauth/authorize?client_id=1',
      {
        canOpenURL: async () => true,
        openURL: async (url) => {
          opened.push(url);
        },
      },
    );
    assert.deepEqual(opened, [
      'https://www.instagram.com/oauth/authorize?client_id=1',
    ]);
  });

  it('rejects a non-Instagram URL before opening', async () => {
    let opened = false;
    await assert.rejects(() =>
      openInstagramInboxAuthorizationUrl('https://example.com/oauth/authorize', {
        canOpenURL: async () => true,
        openURL: async () => {
          opened = true;
        },
      }),
    );
    assert.equal(opened, false);
  });
});
