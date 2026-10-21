import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  CLIENT_PROOF_METHOD_S256,
  type ClientProofCrypto,
} from '../../../authentication/linkedinA3/clientProof';
import { FirebaseCallableHttpError } from '../../../firebase/callableHttp';
import {
  assertTiktokOwnershipExchangeRequest,
  assertTiktokOwnershipExchangeResponse,
  assertTiktokOwnershipGetResponse,
  assertTiktokOwnershipStartRequest,
  assertTiktokOwnershipStartResponse,
  assertTiktokOwnershipUnlinked,
  assertTiktokOwnershipVerified,
} from '../parse';
import { parseTiktokOwnershipReturnUrl } from '../returnUrl';
import { createTiktokOwnershipCallableClient } from '../client';
import { createTiktokOwnershipController } from '../controller';
import { mapTiktokOwnershipThrowable } from '../errors';
import {
  omitTiktokFromDraftValues,
  preserveLegacyTiktokInSocialPatch,
} from '../legacyTiktokPreserve';
import {
  TIKTOK_OWNERSHIP_CALLABLE_NAMES,
  TIKTOK_OWNERSHIP_PLATFORM,
  TIKTOK_OWNERSHIP_RETURN_URL,
} from '../names';

const nodeCrypto: ClientProofCrypto = {
  getRandomBytes: (n) => randomBytes(n),
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest(),
};

const CHALLENGE = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const TX = 'tx_abcdefghijklmnop';

function verifiedForMode(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: TIKTOK_OWNERSHIP_PLATFORM,
    mode,
    openId: 'oid_abc123',
    canonicalUrl: 'https://www.tiktok.com/@nearsy_user',
    usernameCache: 'nearsy_user',
    verifiedAt: '2026-10-19T00:00:00.000Z',
  };
}

describe('tiktok ownership parse', () => {
  it('accepts Start request with mode and platform ios|android', () => {
    const req = assertTiktokOwnershipStartRequest({
      mode: 'professional',
      platform: 'ios',
      clientProofChallenge: CHALLENGE,
      clientProofMethod: CLIENT_PROOF_METHOD_S256,
    });
    assert.equal(req.mode, 'professional');
    assert.equal(req.platform, 'ios');
  });

  it('rejects Start platform tiktok and forbidden client profile fields', () => {
    assert.throws(() =>
      assertTiktokOwnershipStartRequest({
        mode: 'personal',
        platform: 'tiktok',
        clientProofChallenge: CHALLENGE,
        clientProofMethod: CLIENT_PROOF_METHOD_S256,
      }),
    );
    assert.throws(() =>
      assertTiktokOwnershipStartRequest({
        mode: 'personal',
        platform: 'ios',
        clientProofChallenge: CHALLENGE,
        clientProofMethod: CLIENT_PROOF_METHOD_S256,
        username: 'x',
      }),
    );
  });

  it('rejects exchange request body that includes mode', () => {
    assert.throws(() =>
      assertTiktokOwnershipExchangeRequest({
        transactionId: 'tx_abcdef12',
        clientProofVerifier: CHALLENGE,
        mode: 'personal',
      }),
    );
  });

  it('parses Start response with mode and epoch expiresAt; rejects code_challenge', () => {
    const start = assertTiktokOwnershipStartResponse({
      transactionId: 'tx_abcdef12',
      mode: 'personal',
      authorizationUrl:
        'https://www.tiktok.com/v2/auth/authorize/?client_key=x&scope=user.info.basic',
      expiresAt: 1710000000000,
    });
    assert.equal(start.mode, 'personal');
    assert.match(start.expiresAt, /T/);

    assert.throws(() =>
      assertTiktokOwnershipStartResponse({
        transactionId: 'tx_abcdef12',
        mode: 'personal',
        authorizationUrl:
          'https://www.tiktok.com/v2/auth/authorize/?code_challenge=abc',
        expiresAt: 1710000000000,
      }),
    );
  });

  it('parses exchange verified only (no select_channel)', () => {
    const verified = assertTiktokOwnershipExchangeResponse(
      verifiedForMode('personal'),
    );
    assert.equal(verified.result, 'verified');
    assert.equal(verified.usernameCache, 'nearsy_user');
    assert.throws(() =>
      assertTiktokOwnershipExchangeResponse({
        result: 'select_channel',
        platform: 'tiktok',
        mode: 'personal',
        transactionId: 'tx_abcdef12',
        channels: [],
      }),
    );
  });

  it('parses Get not_linked with mode', () => {
    const get = assertTiktokOwnershipGetResponse({
      result: 'not_linked',
      platform: 'tiktok',
      mode: 'professional',
      linked: false,
    });
    assert.equal(get.result, 'not_linked');
    assert.equal(get.mode, 'professional');
  });
});

describe('tiktok ownership return URL', () => {
  it('parses success with mode and error without mode or transactionId', () => {
    const ok = parseTiktokOwnershipReturnUrl(
      'nearsy://tiktok-ownership?transactionId=tx_abcdef12&mode=personal&result=ok',
    );
    assert.equal(ok.kind, 'success');
    if (ok.kind === 'success') {
      assert.equal(ok.mode, 'personal');
    }

    const err = parseTiktokOwnershipReturnUrl(
      'nearsy://tiktok-ownership?result=error&error=TX_INVALID',
    );
    assert.equal(err.kind, 'provider_error');
    if (err.kind === 'provider_error') {
      assert.equal(err.errorCode, 'TX_INVALID');
      assert.equal(err.mode, undefined);
      assert.equal(err.transactionId, undefined);
    }
  });

  it('rejects oauth code/state in return URL', () => {
    const parsed = parseTiktokOwnershipReturnUrl(
      'nearsy://tiktok-ownership?transactionId=tx_abcdef12&mode=personal&result=ok&code=abc',
    );
    assert.equal(parsed.kind, 'invalid');
  });
});

describe('tiktok ownership callable client', () => {
  it('Get/Unlink send mode; exchange has no mode', async () => {
    const calls: Array<{ name: string; data: Record<string, unknown> }> = [];
    const client = createTiktokOwnershipCallableClient(async (name, data) => {
      calls.push({ name, data });
      if (name === TIKTOK_OWNERSHIP_CALLABLE_NAMES.get) {
        return {
          result: 'not_linked',
          platform: 'tiktok',
          mode: data.mode,
          linked: false,
        };
      }
      if (name === TIKTOK_OWNERSHIP_CALLABLE_NAMES.unlink) {
        return {
          result: 'unlinked',
          platform: 'tiktok',
          mode: data.mode,
          unlinked: true,
        };
      }
      if (name === TIKTOK_OWNERSHIP_CALLABLE_NAMES.exchange) {
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
      name: TIKTOK_OWNERSHIP_CALLABLE_NAMES.get,
      data: { mode: 'personal' },
    });
    assert.deepEqual(calls[1], {
      name: TIKTOK_OWNERSHIP_CALLABLE_NAMES.unlink,
      data: { mode: 'professional' },
    });
    assert.equal('mode' in calls[2]!.data, false);
  });
});

describe('tiktok ownership controller', () => {
  it('connect(mode) → exchange verified without SelectChannel', async () => {
    const client = createTiktokOwnershipCallableClient(async (name, data) => {
      if (name === TIKTOK_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/?x=1',
          expiresAt: Date.now() + 60_000,
        };
      }
      if (name === TIKTOK_OWNERSHIP_CALLABLE_NAMES.exchange) {
        assert.equal('mode' in data, false);
        return verifiedForMode('professional');
      }
      throw new Error(name);
    });

    const controller = createTiktokOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async (_url, returnUrl) => {
          assert.equal(returnUrl, TIKTOK_OWNERSHIP_RETURN_URL);
          return {
            type: 'success',
            url: `nearsy://tiktok-ownership?transactionId=${TX}&mode=professional&result=ok`,
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

  it('presents provider_error without mode without getting stuck', async () => {
    const client = createTiktokOwnershipCallableClient(async (name, data) => {
      if (name === TIKTOK_OWNERSHIP_CALLABLE_NAMES.start) {
        return {
          transactionId: TX,
          mode: data.mode,
          authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/?x=1',
          expiresAt: Date.now() + 60_000,
        };
      }
      throw new Error(name);
    });

    const controller = createTiktokOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async () => ({
          type: 'success',
          url: 'nearsy://tiktok-ownership?result=error&error=TX_FAILED',
        }),
      },
    });

    const outcome = await controller.connect('personal');
    assert.equal(outcome.kind, 'error');
    if (outcome.kind === 'error') {
      assert.equal(outcome.error.code, 'TX_FAILED');
    }
  });
});

describe('tiktok ownership error mapping', () => {
  it('maps tiktok tokens and functions/internal to UNKNOWN not NETWORK', () => {
    assert.equal(
      mapTiktokOwnershipThrowable(
        new Error('(tiktok-not-enabled)'),
      ).code,
      'TIKTOK_NOT_ENABLED',
    );
    assert.equal(
      mapTiktokOwnershipThrowable(
        new Error('(tiktok-account-claimed)'),
      ).code,
      'TIKTOK_ACCOUNT_CLAIMED',
    );
    const internal = mapTiktokOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/internal',
        message: 'INTERNAL',
      }),
    );
    assert.equal(internal.code, 'UNKNOWN');
    assert.equal(internal.wireCode, 'functions/internal');
  });
});

describe('legacy tiktok preserve', () => {
  it('omits tiktok from draft values and preserves legacy in patch', () => {
    const omitted = omitTiktokFromDraftValues({
      tiktok: 'https://www.tiktok.com/@x',
      instagram: 'ada',
    });
    assert.equal('tiktok' in omitted, false);
    assert.equal(omitted.instagram, 'ada');

    const patch = preserveLegacyTiktokInSocialPatch(
      'personal',
      {
        socialLinksPersonal: { instagram: 'https://instagram.com/ada' },
      },
      { tiktok: 'https://www.tiktok.com/@legacy' },
    );
    assert.equal(
      patch.socialLinksPersonal?.tiktok,
      'https://www.tiktok.com/@legacy',
    );
  });
});

describe('tiktok verified shape', () => {
  it('rejects canonical/username mismatch', () => {
    assert.throws(() =>
      assertTiktokOwnershipVerified({
        ...verifiedForMode('personal'),
        usernameCache: 'other_user',
      }),
    );
    assert.equal(
      assertTiktokOwnershipUnlinked({
        result: 'unlinked',
        platform: 'tiktok',
        mode: 'personal',
        unlinked: true,
      }).unlinked,
      true,
    );
  });
});
