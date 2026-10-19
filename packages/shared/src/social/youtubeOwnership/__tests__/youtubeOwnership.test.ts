import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';



import {
  createClientProofPair,
  type ClientProofCrypto,
} from '../../../authentication/linkedinA3/clientProof';
import { FirebaseCallableHttpError } from '../../../firebase/callableHttp';
import { createYoutubeOwnershipCallableClient } from '../client';
import { createYoutubeOwnershipController } from '../controller';
import {
  mapYoutubeOwnershipThrowable,
  YoutubeOwnershipClientError,
} from '../errors';
import {
  omitYoutubeFromDraftValues,
  preserveLegacyYoutubeInSocialPatch,
} from '../legacyYoutubePreserve';
import { YOUTUBE_OWNERSHIP_CALLABLE_NAMES, YOUTUBE_OWNERSHIP_RETURN_URL } from '../names';
import {
  assertYoutubeOwnershipExchangeRequest,
  assertYoutubeOwnershipGetResponse,
  assertYoutubeOwnershipStartRequest,
  assertYoutubeOwnershipStartResponse,
} from '../parse';
import { parseYoutubeOwnershipReturnUrl } from '../returnUrl';



const nodeCrypto: ClientProofCrypto = {
  getRandomBytes: (n) => randomBytes(n),
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest(),
};



const CHANNEL = 'UCxxxxxxxxxxxxxxxxxxxxxx';
const TX = 'tx_abcdefghijklmnop';



function verifiedForMode(mode: 'personal' | 'professional') {
  return {
    result: 'verified' as const,
    platform: 'youtube' as const,
    mode,
    channelId: CHANNEL,
    canonicalUrl: `https://www.youtube.com/channel/${CHANNEL}`,
    customUrlCache: null,
    verifiedAt: '2026-10-16T00:00:00.000Z',
  };
}



describe('youtube ownership parse', () => {
  it('accepts Start request with mode and platform ios|android', () => {
    for (const platform of ['ios', 'android'] as const) {
      for (const mode of ['personal', 'professional'] as const) {
        const req = assertYoutubeOwnershipStartRequest({
          mode,
          platform,
          clientProofChallenge: 'a'.repeat(43),
          clientProofMethod: 'S256',
        });
        assert.equal(req.mode, mode);
        assert.equal(req.platform, platform);
      }
    }
  });



  it('rejects Start platform youtube and missing mode', () => {
    assert.throws(
      () =>
        assertYoutubeOwnershipStartRequest({
          mode: 'personal',
          platform: 'youtube',
          clientProofChallenge: 'a'.repeat(43),
          clientProofMethod: 'S256',
        }),
      /INVALID_START_PLATFORM/,
    );
    assert.throws(
      () =>
        assertYoutubeOwnershipStartRequest({
          platform: 'ios',
          clientProofChallenge: 'a'.repeat(43),
          clientProofMethod: 'S256',
        }),
      /INVALID_YOUTUBE_OWNERSHIP_MODE/,
    );
  });



  it('rejects Start with returnUrl / url', () => {
    assert.throws(() =>
      assertYoutubeOwnershipStartRequest({
        mode: 'personal',
        platform: 'ios',
        clientProofChallenge: 'a'.repeat(43),
        clientProofMethod: 'S256',
        returnUrl: 'nearsy://youtube-ownership',
      }),
    );
  });



  it('rejects exchange request body that includes mode', () => {
    assert.throws(
      () =>
        assertYoutubeOwnershipExchangeRequest({
          transactionId: TX,
          clientProofVerifier: 'v'.repeat(43),
          mode: 'personal',
        }),
      /FORBIDDEN_EXCHANGE_MODE/,
    );
  });



  it('parses Start response with mode and epoch expiresAt', () => {
    const epochMs = Date.parse('2026-10-17T01:25:00.000Z');
    const res = assertYoutubeOwnershipStartResponse({
      transactionId: TX,
      mode: 'professional',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      expiresAt: epochMs,
    });
    assert.equal(res.mode, 'professional');
    assert.equal(res.expiresAt, '2026-10-17T01:25:00.000Z');
  });



  it('parses exchange verified and select_channel with mode', () => {
    assert.equal(
      assertYoutubeOwnershipGetResponse(verifiedForMode('personal')).result,
      'verified',
    );
    const select = assertYoutubeOwnershipGetResponse({
      result: 'not_linked',
      platform: 'youtube',
      mode: 'personal',
      linked: false,
    });
    assert.equal(select.result, 'not_linked');
  });



  it('parses Get not_linked with mode', () => {
    const get = assertYoutubeOwnershipGetResponse({
      result: 'not_linked',
      platform: 'youtube',
      mode: 'professional',
      linked: false,
    });
    assert.equal(get.mode, 'professional');
  });
});



describe('youtube ownership return URL', () => {
  it('parses success and callback errors with mode echo', () => {
    const ok = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=${TX}&mode=personal&result=ok`,
    );
    assert.equal(ok.kind, 'success');
    if (ok.kind === 'success') {
      assert.equal(ok.mode, 'personal');
    }



    const err = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=${TX}&mode=professional&result=error&error=TX_EXPIRED`,
    );
    assert.equal(err.kind, 'provider_error');
    if (err.kind === 'provider_error') {
      assert.equal(err.mode, 'professional');
    }
  });



  it('rejects success without mode', () => {
    const parsed = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=${TX}&result=ok`,
    );
    assert.equal(parsed.kind, 'invalid');
  });



  it('rejects oauth code/state in return URL', () => {
    const parsed = parseYoutubeOwnershipReturnUrl(
      `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=${TX}&mode=personal&result=ok&code=abc`,
    );
    assert.equal(parsed.kind, 'invalid');
  });
});



describe('youtube ownership callable client', () => {
  it('Get/Unlink send mode for personal and professional', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = createYoutubeOwnershipCallableClient(async (name, data) => {
      payloads.push({ name, ...data });
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.get) {
        return verifiedForMode(String(data.mode) as 'personal' | 'professional');
      }
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.unlink) {
        return {
          result: 'unlinked',
          platform: 'youtube',
          mode: data.mode,
          unlinked: true,
        };
      }
      throw new Error(`unexpected ${name}`);
    });



    await client.get('personal');
    await client.get('professional');
    await client.unlink('professional');



    assert.deepEqual(
      payloads.map((p) => ({ name: p.name, mode: p.mode })),
      [
        { name: YOUTUBE_OWNERSHIP_CALLABLE_NAMES.get, mode: 'personal' },
        { name: YOUTUBE_OWNERSHIP_CALLABLE_NAMES.get, mode: 'professional' },
        { name: YOUTUBE_OWNERSHIP_CALLABLE_NAMES.unlink, mode: 'professional' },
      ],
    );
  });



  it('exchange invoke payload has no mode key', async () => {
    let exchangePayload: Record<string, unknown> | null = null;
    const client = createYoutubeOwnershipCallableClient(async (name, data) => {
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.exchange) {
        exchangePayload = data;
        return verifiedForMode('personal');
      }
      throw new Error(`unexpected ${name}`);
    });
    await client.exchange({
      transactionId: TX,
      clientProofVerifier: 'v'.repeat(43),
    });
    assert.ok(exchangePayload);
    assert.equal('mode' in exchangePayload!, false);
  });
});



describe('youtube ownership controller', () => {
  function mockClient(mode: 'personal' | 'professional') {
    return createYoutubeOwnershipCallableClient(async (name, data) => {
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.start) {
        assert.equal(data.mode, mode);
        assert.equal(data.platform, 'ios');
        assert.equal(data.clientProofMethod, 'S256');
        assert.equal('returnUrl' in data, false);
        return {
          transactionId: TX,
          mode,
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          expiresAt: '2099-01-01T00:00:00.000Z',
        };
      }
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.exchange) {
        assert.equal(typeof data.clientProofVerifier, 'string');
        assert.equal('mode' in data, false);
        return verifiedForMode(mode);
      }
      throw new Error(`unexpected ${name}`);
    });
  }



  it('connect(mode) → exchange verified without changing session', async () => {
    const calls: string[] = [];
    const client = createYoutubeOwnershipCallableClient(async (name, data) => {
      calls.push(name);
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.start) {
        assert.equal(data.mode, 'personal');
        return {
          transactionId: TX,
          mode: 'personal',
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          expiresAt: '2099-01-01T00:00:00.000Z',
        };
      }
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.exchange) {
        assert.equal('mode' in data, false);
        return verifiedForMode('personal');
      }
      throw new Error(`unexpected ${name}`);
    });



    const controller = createYoutubeOwnershipController({
      client,
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async (_url, returnUrl) => {
          assert.equal(returnUrl, YOUTUBE_OWNERSHIP_RETURN_URL);
          return {
            type: 'success',
            url: `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=${TX}&mode=personal&result=ok`,
          };
        },
      },
    });



    const outcome = await controller.connect('personal');
    assert.equal(outcome.kind, 'verified');
    if (outcome.kind === 'verified') {
      assert.equal(outcome.verified.mode, 'personal');
    }
    assert.deepEqual(calls, [
      YOUTUBE_OWNERSHIP_CALLABLE_NAMES.start,
      YOUTUBE_OWNERSHIP_CALLABLE_NAMES.exchange,
    ]);
  });



  it('TX_INVALID when return mode echo mismatches Start mode', async () => {
    const controller = createYoutubeOwnershipController({
      client: mockClient('professional'),
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async () => ({
          type: 'success',
          url: `${YOUTUBE_OWNERSHIP_RETURN_URL}?transactionId=${TX}&mode=personal&result=ok`,
        }),
      },
    });
    const outcome = await controller.connect('professional');
    assert.equal(outcome.kind, 'error');
    if (outcome.kind === 'error') {
      assert.equal(outcome.error.code, 'TX_INVALID');
    }
  });



  it('treats browser cancel as cancelled', async () => {
    const controller = createYoutubeOwnershipController({
      client: mockClient('personal'),
      crypto: nodeCrypto,
      getUid: () => 'uid-1',
      browser: {
        openAuthSession: async () => ({ type: 'cancel' }),
      },
    });
    const outcome = await controller.connect('personal');
    assert.equal(outcome.kind, 'cancelled');
  });
});



describe('youtube ownership Start payload vs backend constraints', () => {
  it('generated Start payload matches validator shape', async () => {
    let captured: Record<string, unknown> | null = null;
    const client = createYoutubeOwnershipCallableClient(async (name, data) => {
      if (name === YOUTUBE_OWNERSHIP_CALLABLE_NAMES.start) {
        captured = data;
        assertYoutubeOwnershipStartRequest(data);
        return {
          transactionId: TX,
          mode: 'personal',
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          expiresAt: '2099-01-01T00:00:00.000Z',
        };
      }
      throw new Error(`unexpected ${name}`);
    });



    const pair = await createClientProofPair(nodeCrypto);
    await client.start({
      mode: 'personal',
      platform: 'ios',
      clientProofChallenge: pair.clientProofChallenge,
    });
    pair.clientProofVerifier = '';



    assert.ok(captured);
    assert.equal(captured!.mode, 'personal');
    assert.equal(captured!.platform, 'ios');
    assert.equal('setPublication' in YOUTUBE_OWNERSHIP_CALLABLE_NAMES, false);
    assert.equal('youtubeOwnershipSetPublication' in captured!, false);
  });
});



describe('youtube ownership error mapping', () => {
  it('maps mode contract messages to INVALID_ARGUMENT', () => {
    const mapped = mapYoutubeOwnershipThrowable(
      new Error('mode cannot be changed after Start'),
      'start',
    );
    assert.equal(mapped.code, 'INVALID_ARGUMENT');
  });



  it('maps parse INVALID_* to INVALID_RESPONSE with stage', () => {
    const mapped = mapYoutubeOwnershipThrowable(
      new Error('INVALID_START_RESPONSE'),
      'start',
    );
    assert.equal(mapped.code, 'INVALID_RESPONSE');
    assert.equal(mapped.stage, 'start');
  });



  it('preserves Firebase wireCode for failed-precondition', () => {
    const mapped = mapYoutubeOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/failed-precondition',
        message: 'Callable App Check token is required.',
      }),
      'start',
    );
    assert.equal(mapped.code, 'INVALID_ARGUMENT');
    assert.equal(mapped.wireCode, 'functions/failed-precondition');
  });

  it('maps functions/internal to UNKNOWN, not NETWORK', () => {
    const mapped = mapYoutubeOwnershipThrowable(
      new FirebaseCallableHttpError({
        code: 'functions/internal',
        message: 'INTERNAL',
      }),
      'foundation',
    );
    assert.equal(mapped.code, 'UNKNOWN');
    assert.equal(mapped.wireCode, 'functions/internal');
    assert.equal(mapped.retryable, true);
  });
});



describe('legacy youtube preserve', () => {
  it('omits youtube from draft values and preserves legacy in patch', () => {
    const omitted = omitYoutubeFromDraftValues({
      youtube: 'https://youtube.com/@x',
      instagram: 'ada',
    });
    assert.equal('youtube' in omitted, false);
    assert.equal(omitted.instagram, 'ada');



    const patch = preserveLegacyYoutubeInSocialPatch(
      'personal',
      {
        socialLinksPersonal: { instagram: 'https://instagram.com/ada' },
      },
      { youtube: 'https://www.youtube.com/@legacy' },
    );
    assert.equal(
      patch.socialLinksPersonal?.youtube,
      'https://www.youtube.com/@legacy',
    );
  });
});

