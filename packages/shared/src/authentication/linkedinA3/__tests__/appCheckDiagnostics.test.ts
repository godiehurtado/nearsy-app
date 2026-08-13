/**
 * I1-I / I1-J diagnostics + bootstrap cause preservation tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  sanitizeAppCheckSafeMessage,
  buildAppCheckFailureDiagnostic,
  extractNativeAppCheckError,
  parseAppCheckServerErrorFields,
  classifyAppCheckHttpStatus,
} from '../appCheck/appCheckDiagnostics';
import { createAppCheckBootstrap } from '../appCheck/appCheckBootstrap';
import { LinkedInA3ClientError } from '../sanitize';

describe('appCheckDiagnostics', () => {
  it('redacts UUID-like and long tokenish strings from safe messages', () => {
    const msg = sanitizeAppCheckSafeMessage(
      'failed exchange for 123e4567-e89b-12d3-a456-426614174000 token=abcdefghijklmnopqrstuvwxyz0123456789',
    );
    assert.equal(msg.includes('123e4567'), false);
    assert.equal(msg.includes('abcdefghijklmnopqrstuvwxyz0123456789'), false);
    assert.match(msg, /\[redacted\]/);
  });

  it('fully hides Firebase App ID fragments (including leak-style remnants)', () => {
    const leaked =
      'The server responded with an error: - URL: https://firebaseappcheck.googleapis.com/v1/projects/nearsy-dev/apps/1:477970832846:ios:4cbfb98ef0180abcd/exchangeDebugToken';
    const msg = sanitizeAppCheckSafeMessage(leaked);
    assert.equal(msg.includes('477970832846'), false);
    assert.equal(msg.includes('4cbfb98ef0180'), false);
    assert.equal(msg.includes('1:'), false);
    assert.match(msg, /firebaseappcheck\.googleapis\.com\/\[path\]/);

    const remnant =
      'URL: https://firebaseappcheck.googleapis.[redacted]:477970832846:ios:4cbfb98ef0180';
    const msg2 = sanitizeAppCheckSafeMessage(remnant);
    assert.equal(msg2.includes('477970832846'), false);
    assert.equal(msg2.includes('4cbfb98ef0180'), false);
  });

  it('parses HTTP status + Firebase JSON from full native server error', () => {
    const raw = `[appCheck/token-error] The operation couldn’t be completed. The server responded with an error:
- URL: https://firebaseappcheck.googleapis.com/v1/projects/nearsy-dev/apps/1:477970832846:ios:4cbfb98ef0180abcd:exchangeDebugToken
- HTTP status code: 403
- Response body: {
  "error": {
    "code": 403,
    "message": "App attestation failed.",
    "status": "PERMISSION_DENIED"
  }
}`;
    const parsed = parseAppCheckServerErrorFields(raw);
    assert.equal(parsed.httpStatus, 403);
    assert.equal(parsed.firebaseStatus, 'PERMISSION_DENIED');
    assert.match(parsed.firebaseErrorMessage ?? '', /attestation/i);
    assert.equal(parsed.exchangeOperation, 'exchangeDebugToken');
    assert.equal(parsed.exchangeHost, 'firebaseappcheck.googleapis.com');
    assert.equal(parsed.targetAppIdShapeMatchesIos, true);
    assert.equal(classifyAppCheckHttpStatus(403).class, 'authz_or_unregistered');

    const d = buildAppCheckFailureDiagnostic(
      { code: 'appCheck/token-error', message: raw },
      'get_token',
      1,
    );
    assert.equal(d.httpStatus, 403);
    assert.equal(d.safeMessage.includes('477970832846'), false);
  });

  it('maps native appCheck token-error codes', () => {
    const d = buildAppCheckFailureDiagnostic(
      {
        code: 'appCheck/token-error',
        message: 'Unable to retrieve App Check token: network',
      },
      'get_token',
      1,
    );
    assert.equal(d.stage, 'get_token');
    assert.equal(d.normalizedCode, 'appCheck/token-error');
    assert.equal(d.retryNumber, 1);
    assert.equal(d.safeMessage.includes('network'), true);
  });

  it('extracts domain when present without leaking long secrets', () => {
    const extracted = extractNativeAppCheckError({
      code: 'token-error',
      domain: 'com.firebase.appCheck',
      message: 'x'.repeat(80),
    });
    assert.equal(extracted.nativeDomain, 'com.firebase.appCheck');
    assert.ok(extracted.safeMessage.length <= 220);
  });

  it('infers exchangeDebugToken for get_token + App Check host without path', () => {
    const d = buildAppCheckFailureDiagnostic(
      {
        code: 'appCheck/token-error',
        message:
          'The server responded with an error: - URL: https://firebaseappcheck.googleapis.com/ truncated',
      },
      'get_token',
      1,
    );
    assert.equal(d.exchangeOperation, 'exchangeDebugToken');
    assert.equal(d.httpStatus, null);
  });
});

describe('createAppCheckBootstrap cause preservation', () => {
  it('preserves native cause code when port throws non-LinkedIn error', async () => {
    const bootstrap = createAppCheckBootstrap({
      maxAttempts: 1,
      timeoutMs: 5_000,
      port: {
        async initialize() {},
        async ensureToken() {
          const err = new Error('native failure') as Error & { code?: string };
          err.code = 'appCheck/token-error';
          throw err;
        },
      },
    });

    await assert.rejects(
      () => bootstrap.initialize(),
      (err: unknown) => {
        assert.ok(err instanceof LinkedInA3ClientError);
        assert.equal(err.code, 'APP_CHECK_FAILED');
        assert.equal(err.causeCode, 'appCheck/token-error');
        return true;
      },
    );
  });

  it('retries initialize+ensure within bootstrap maxAttempts', async () => {
    let initializeCalls = 0;
    let ensureCalls = 0;
    const bootstrap = createAppCheckBootstrap({
      maxAttempts: 2,
      timeoutMs: 5_000,
      sleep: async () => {},
      port: {
        async initialize() {
          initializeCalls += 1;
        },
        async ensureToken() {
          ensureCalls += 1;
          if (ensureCalls === 1) {
            throw Object.assign(new Error('first'), {
              code: 'appCheck/token-error',
            });
          }
        },
      },
    });

    await bootstrap.initialize();
    assert.equal(initializeCalls, 2);
    assert.equal(ensureCalls, 2);
    assert.equal(bootstrap.getState(), 'ready');
  });
});
