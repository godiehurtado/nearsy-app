import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  CLIENT_PROOF_METHOD_S256,
  type ClientProofCrypto,
} from '../../../authentication/linkedinA3/clientProof';
import { FirebaseCallableHttpError } from '../../../firebase/callableHttp';
import {
  assertXOwnershipExchangeRequest,
  assertXOwnershipExchangeResponse,
  assertXOwnershipGetResponse,
  assertXOwnershipStartRequest,
  assertXOwnershipStartResponse,
  assertXOwnershipUnlinked,
  assertXOwnershipVerified,
} from '../parse';
import { parseXOwnershipReturnUrl } from '../returnUrl';
import { createXOwnershipCallableClient } from '../client';
import { createXOwnershipController } from '../controller';
import { mapXOwnershipThrowable, xOwnershipErrorMessageKey } from '../errors';
import {
  omitXFromDraftValues,
  preserveLegacyXInSocialPatch,
} from '../legacyXPreserve';
import {
  X_OWNERSHIP_CALLABLE_NAMES,
  X_OWNERSHIP_PLATFORM,
  X_OWNERSHIP_RETURN_URL,
} from '../names';
import profileEn from '../../../i18n/resources/profile';

const nodeCrypto: ClientProofCrypto = {
  getRandomBytes: (n) => randomBytes(n),
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest(),
};

const CHALLENGE = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const TX = 'tx_abcdefghijklmnop';
const AUTHORIZE =
  'https://x.com/i/oauth2/authorize?scope=tweet.read%20users.read&code_challenge=abc&code_challenge_method=S256';

function verifiedForMode(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: X_OWNERSHIP_PLATFORM,
    mode,
    userId: '2244994945',
    canonicalUrl: 'https://x.com/nearsy_user',
    usernameCache: 'nearsy_user',
    verifiedAt: '2026-10-23T02:00:00.000Z',
  };
}

describe('x ownership parse', () => {
  it('accepts Start request with mode and platform ios|android', () => {
    const req = assertXOwnershipStartRequest({
      mode: 'professional',
      platform: 'ios',
      clientProofChallenge: CHALLENGE,
      clientProofMethod: CLIENT_PROOF_METHOD_S256,
    });
    assert.equal(req.mode, 'professional');
    assert.equal(req.platform, 'ios');
  });

  it('rejects Start platform x/twitter and forbidden client profile/PKCE fields', () => {
    assert.throws(() =>
      assertXOwnershipStartRequest({
        mode: 'personal',
        platform: 'x',
        clientProofChallenge: CHALLENGE,
        clientProofMethod: CLIENT_PROOF_METHOD_S256,
      }),
    );
    assert.throws(() =>
      assertXOwnershipStartRequest({
        mode: 'personal',
        platform: 'ios',
        clientProofChallenge: CHALLENGE,
        clientProofMethod: CLIENT_PROOF_METHOD_S256,
        username: 'nearsy',
      }),
    );
    assert.throws(() =>
      assertXOwnershipStartRequest({
        mode: 'personal',
        platform: 'ios',
        clientProofChallenge: CHALLENGE,
        clientProofMethod: CLIENT_PROOF_METHOD_S256,
        code_challenge: 'abc',
      }),
    );
  });

  it('rejects exchange request body that includes mode', () => {
    assert.throws(() =>
      assertXOwnershipExchangeRequest({
        transactionId: 'tx_abcdef12',
        clientProofVerifier: CHALLENGE,
        mode: 'personal',
      }),
    );
  });

  it('parses Start response with epoch expiresAt and keeps server X PKCE on the URL', () => {
    const start = assertXOwnershipStartResponse({
      transactionId: 'tx_abcdef12',
      mode: 'personal',
      authorizationUrl: AUTHORIZE,
      expiresAt: 1730000000000,
    });
    assert.equal(start.mode, 'personal');
    assert.equal(start.expiresAt, 1730000000000);
    assert.match(start.authorizationUrl, /code_challenge=/);
  });

  it('parses exchange verified only (no select_channel) and allows null usernameCache', () => {
    const verified = assertXOwnershipExchangeResponse(
      verifiedForMode('personal'),
    );
    assert.equal(verified.result, 'verified');
    assert.equal(verified.userId, '2244994945');

    const withoutCache = assertXOwnershipVerified({
      ...verifiedForMode('personal'),
      usernameCache: null,
    });
    assert.equal(withoutCache.usernameCache, null);

    assert.throws(() =>
      assertXOwnershipExchangeResponse({
        result: 'select_channel',
        platform: 'x',
        mode: 'personal',
        transactionId: 'tx_abcdef12',
        channels: [],
      }),
    );
  });

  it('parses Get not_linked with mode', () => {
    const get = assertXOwnershipGetResponse({
      result: 'not_linked',
      platform: 'x',
      mode: 'professional',
      linked: false,
    });
    assert.equal(get.result, 'not_linked');
    assert.equal(get.mode, 'professional');
  });
});

describe('x ownership return URL', () => {
  it('parses success and treats mode as optional/informational', () => {
    const ok = parseXOwnershipReturnUrl(
      'nearsy://x-ownership?transactionId=tx_abcdef12&mode=personal&result=ok',
    );
    assert.equal(ok.kind, 'success');
    if (ok.kind === 'success') {
      assert.equal(ok.mode, 'personal');
      assert.equal(ok.transactionId, 'tx_abcdef12');
    }

    const okNoMode = parseXOwnershipReturnUrl(
      'nearsy://x-ownership?transactionId=tx_abcdef12&result=ok',
    );
    assert.equal(okNoMode.kind, 'success');
    if (okNoMode.kind === 'success') {
      assert.equal(okNoMode.mode, undefined);
    }
  });

  it('parses callback errors including X_OAUTH and credits/access', () => {
    const err = parseXOwnershipReturnUrl(
      'nearsy://x-ownership?result=error&error=X_OAUTH',
    );
    assert.equal(err.kind, 'provider_error');
    if (err.kind === 'provider_error') {
      assert.equal(err.errorCode, 'X_OAUTH');
    }

    const credits = parseXOwnershipReturnUrl(
      'nearsy://x-ownership?result=error&error=X_CREDITS_OR_ACCESS&transactionId=tx_abcdef12',
    );
    assert.equal(credits.kind, 'provider_error');
    if (credits.kind === 'provider_error') {
      assert.equal(credits.errorCode, 'X_CREDITS_OR_ACCESS');
    }
  });

  it('rejects oauth code/state in return URL', () => {
    const parsed = parseXOwnershipReturnUrl(
      'nearsy://x-ownership?transactionId=tx_abcdef12&mode=personal&result=ok&code=abc',
    );
    assert.equal(parsed.kind, 'invalid');
  });
});

describe('x ownership callable client', () => {
  it('Get/Unlink send mode; exchange has no mode', async () => {
    const calls: Array<{ name: string; data: Record<string, unknown> }> = [];
    const client = createXOwnershipCallableClient(async (name, data) => {
      calls.push({ name, data });
      if (name === X_OWNERSHIP_CALLABLE_NAMES.get) {
        return {
          result: 'not_linked',
          platform: 'x',
          mode: data.mode,
          linked: false,
        };
      }
      if (name === X_OWNERSHIP_CALLABLE_NAMES.unlink) {
        return {
          result: 'unlinked',
          platform: 'x',
          mode: data.mode,
          unlinked: true,
        };
      }
      if (name === X_OWNERSHIP_CALLABLE_NAMES.exchange) {
        return verifiedForMode('personal');
      }
      throw new Error(`unexpected ${name}`);
    });

    await client.get('personal');
    await client.unlink('professional');
    await client.exchange({
      transactionId: TX,
      clientProofVerifier: CHALLENGE,
    });

    assert.deepEqual(calls[0], {
      name: X_OWNERSHIP_CALLABLE_NAMES.get,
      data: { mode: 'personal' },
    });
    assert.deepEqual(calls[1], {
      name: X_OWNERSHIP_CALLABLE_NAMES.unlink,
      data: { mode: 'professional' },
    });
    assert.equal('mode' in calls[2]!.data, false);
  });
});

describe('x ownership controller', () => {
  it('connect(mode) → exchange verified without sending mode', async () => {
    const client = createXOwnershipCallableClient(async (name, data) => {
      if (name === X_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: AUTHORIZE,
          expiresAt: Date.now() + 60_000,
        };
      }
      if (name === X_OWNERSHIP_CALLABLE_NAMES.exchange) {
        assert.equal('mode' in data, false);
        return verifiedForMode('professional');
      }
      throw new Error(name);
    });

    const controller = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async (_url, returnUrl) => {
          assert.equal(returnUrl, X_OWNERSHIP_RETURN_URL);
          return {
            type: 'success',
            url: `nearsy://x-ownership?transactionId=${TX}&mode=professional&result=ok`,
          };
        },
      },
    });

    const outcome = await controller.connect('professional');
    assert.equal(outcome.kind, 'verified');
    if (outcome.kind === 'verified') {
      assert.equal(outcome.verified.mode, 'professional');
    }
  });

  it('correlates transactionId and ignores informational deep-link mode mismatch', async () => {
    let exchanged = false;
    const client = createXOwnershipCallableClient(async (name, data) => {
      if (name === X_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: AUTHORIZE,
          expiresAt: Date.now() + 60_000,
        };
      }
      if (name === X_OWNERSHIP_CALLABLE_NAMES.exchange) {
        exchanged = true;
        assert.equal(data.transactionId, TX);
        return verifiedForMode('personal');
      }
      throw new Error(name);
    });

    const controller = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async () => ({
          type: 'success',
          url: `nearsy://x-ownership?transactionId=${TX}&mode=professional&result=ok`,
        }),
      },
    });

    const outcome = await controller.connect('personal');
    assert.equal(exchanged, true);
    assert.equal(outcome.kind, 'verified');
  });

  it('does not Exchange after cancel, expiry, or transaction mismatch', async () => {
    let exchangeCalls = 0;
    const client = createXOwnershipCallableClient(async (name, data) => {
      if (name === X_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: AUTHORIZE,
          expiresAt: Date.now() + 60_000,
        };
      }
      if (name === X_OWNERSHIP_CALLABLE_NAMES.exchange) {
        exchangeCalls += 1;
        return verifiedForMode('personal');
      }
      throw new Error(name);
    });

    const cancelled = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: { openAuthSession: async () => ({ type: 'cancel' }) },
    });
    const cancelOutcome = await cancelled.connect('personal');
    assert.equal(cancelOutcome.kind, 'cancelled');

    const mismatch = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async () => ({
          type: 'success',
          url: 'nearsy://x-ownership?transactionId=tx_otherother12&mode=personal&result=ok',
        }),
      },
    });
    const mismatchOutcome = await mismatch.connect('personal');
    assert.equal(mismatchOutcome.kind, 'error');
    if (mismatchOutcome.kind === 'error') {
      assert.equal(mismatchOutcome.error.code, 'TX_INVALID');
    }

    const expired = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      nowMs: () => Date.now() + 120_000,
      browser: {
        openAuthSession: async () => ({
          type: 'success',
          url: `nearsy://x-ownership?transactionId=${TX}&mode=personal&result=ok`,
        }),
      },
    });
    const expiredOutcome = await expired.connect('personal');
    assert.equal(expiredOutcome.kind, 'error');
    if (expiredOutcome.kind === 'error') {
      assert.equal(expiredOutcome.error.code, 'TX_EXPIRED');
    }

    assert.equal(exchangeCalls, 0);
  });

  it('presents provider_error without mode without getting stuck', async () => {
    const client = createXOwnershipCallableClient(async (name, data) => {
      if (name === X_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: AUTHORIZE,
          expiresAt: Date.now() + 60_000,
        };
      }
      throw new Error(name);
    });

    const controller = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async () => ({
          type: 'success',
          url: 'nearsy://x-ownership?result=error&error=X_RATE_LIMITED',
        }),
      },
    });

    const outcome = await controller.connect('personal');
    assert.equal(outcome.kind, 'error');
    if (outcome.kind === 'error') {
      assert.equal(outcome.error.code, 'X_RATE_LIMITED');
      assert.equal(outcome.error.retryable, false);
    }
  });

  it('clears in-flight proof when the signed-in account changes', async () => {
    let uid: string | null = 'uid-1';
    let exchangeCalls = 0;
    const client = createXOwnershipCallableClient(async (name, data) => {
      if (name === X_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: AUTHORIZE,
          expiresAt: Date.now() + 60_000,
        };
      }
      if (name === X_OWNERSHIP_CALLABLE_NAMES.exchange) {
        exchangeCalls += 1;
        return verifiedForMode('personal');
      }
      throw new Error(name);
    });

    const controller = createXOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => uid,
      browser: {
        openAuthSession: async () => {
          uid = 'uid-2';
          return {
            type: 'success',
            url: `nearsy://x-ownership?transactionId=${TX}&mode=personal&result=ok`,
          };
        },
      },
    });

    const outcome = await controller.connect('personal');
    assert.equal(outcome.kind, 'error');
    if (outcome.kind === 'error') {
      assert.equal(outcome.error.code, 'SESSION_CHANGED');
    }
    assert.equal(exchangeCalls, 0);
  });
});

describe('x ownership error mapping', () => {
  it('maps public X tokens and functions/internal to UNKNOWN not NETWORK', () => {
    assert.equal(
      mapXOwnershipThrowable(new Error('(x-not-enabled)')).code,
      'X_NOT_ENABLED',
    );
    assert.equal(
      mapXOwnershipThrowable(new Error('(x-account-claimed)')).code,
      'X_ACCOUNT_CLAIMED',
    );
    assert.equal(
      mapXOwnershipThrowable(new Error('(x-oauth-failed)')).code,
      'X_OAUTH',
    );
    const rate = mapXOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/resource-exhausted',
        message: '(x-rate-limited)',
      }),
    );
    assert.equal(rate.code, 'X_RATE_LIMITED');
    assert.equal(rate.retryable, false);

    const credits = mapXOwnershipThrowable(new Error('(x-credits-or-access)'));
    assert.equal(credits.code, 'X_CREDITS_OR_ACCESS');
    assert.equal(credits.retryable, false);
    assert.equal(
      xOwnershipErrorMessageKey(credits.code),
      'profile.social.x.errors.creditsOrAccess',
    );

    const forbidden = mapXOwnershipThrowable(new Error('(x-api-forbidden)'));
    assert.equal(forbidden.code, 'X_FORBIDDEN');
    assert.doesNotMatch(
      profileEn.social.x.errors.creditsOrAccess,
      /free|gratis|billing/i,
    );
    assert.doesNotMatch(
      profileEn.social.x.errors.forbidden,
      /free|gratis|billing/i,
    );

    const internal = mapXOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/internal',
        message: 'INTERNAL',
      }),
    );
    assert.equal(internal.code, 'UNKNOWN');
    assert.equal(internal.wireCode, 'functions/internal');
  });
});

describe('legacy x / twitter preserve', () => {
  it('omits x from draft values and preserves legacy twitter in patch', () => {
    const omitted = omitXFromDraftValues({
      x: 'https://x.com/legacy',
      instagram: 'ada',
    });
    assert.equal('x' in omitted, false);
    assert.equal(omitted.instagram, 'ada');

    const patch = preserveLegacyXInSocialPatch(
      'personal',
      {
        socialLinksPersonal: { instagram: 'https://instagram.com/ada' },
      },
      { twitter: 'https://x.com/legacy' },
    );
    assert.equal(patch.socialLinksPersonal?.twitter, 'https://x.com/legacy');
    assert.equal('x' in (patch.socialLinksPersonal ?? {}), false);
  });
});

describe('x verified shape', () => {
  it('rejects canonical/username mismatch and accepts unlink', () => {
    assert.throws(() =>
      assertXOwnershipVerified({
        ...verifiedForMode('personal'),
        usernameCache: 'other_user',
      }),
    );
    assert.equal(
      assertXOwnershipUnlinked({
        result: 'unlinked',
        platform: 'x',
        mode: 'personal',
        unlinked: true,
      }).unlinked,
      true,
    );
  });
});
