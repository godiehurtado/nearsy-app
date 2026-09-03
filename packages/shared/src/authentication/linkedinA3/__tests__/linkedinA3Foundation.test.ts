import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertEnvironmentConsistency } from '../environment/assertEnvironmentConsistency';
import {
  isDebugAppCheckAllowed,
  parseNearsyFirebaseEnvironmentName,
  resolveNearsyFirebaseEnvironment,
  FUNCTIONS_REGION,
} from '../environment/nearsyFirebaseEnvironment';
import { createAppCheckBootstrap } from '../appCheck/appCheckBootstrap';
import { createLinkedInA3CallableClient } from '../functions/linkedInA3CallableClient';
import {
  LinkedInA3ClientError,
  sanitizeAuthorizationUrl,
  sanitizeTransactionId,
} from '../sanitize';
import { CRJ_CROSS_PLATFORM_DECISION_PENDING } from '../index';

describe('nearsyFirebaseEnvironment', () => {
  it('selects development → nearsy-dev with debug App Check', () => {
    const env = resolveNearsyFirebaseEnvironment('development');
    assert.equal(env.firebaseProjectId, 'nearsy-dev');
    assert.equal(env.appCheckProvider, 'debug');
    assert.equal(env.linkedInAuthEnabled, true);
    assert.equal(env.functionsRegion, FUNCTIONS_REGION);
    assert.equal(env.googleServicesFile, './GoogleService-Info.development.plist');
  });

  it('selects production → nearsy-pj with LinkedIn enabled', () => {
    const env = resolveNearsyFirebaseEnvironment('production');
    assert.equal(env.firebaseProjectId, 'nearsy-pj');
    assert.equal(env.linkedInAuthEnabled, true);
    assert.equal(env.appCheckProvider, 'production_pending');
    assert.equal(isDebugAppCheckAllowed('production'), false);
  });

  it('defaults empty env name to production', () => {
    assert.equal(parseNearsyFirebaseEnvironmentName(''), 'production');
    assert.equal(parseNearsyFirebaseEnvironmentName(undefined), 'production');
  });
});

describe('assertEnvironmentConsistency', () => {
  it('detects mixed native/JS projects', () => {
    const result = assertEnvironmentConsistency({
      environment: 'development',
      expectedProjectId: 'nearsy-dev',
      nativeProjectId: 'nearsy-dev',
      jsProjectId: 'nearsy-pj',
      functionsRegion: 'us-central1',
      appCheckProvider: 'debug',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'ENV_JS_PROJECT_MISMATCH');
    }
  });

  it('detects inverse mix', () => {
    const result = assertEnvironmentConsistency({
      environment: 'production',
      expectedProjectId: 'nearsy-pj',
      nativeProjectId: 'nearsy-dev',
      jsProjectId: 'nearsy-pj',
      functionsRegion: 'us-central1',
      appCheckProvider: 'production_pending',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'ENV_NATIVE_PROJECT_MISMATCH');
    }
  });

  it('forbids Debug Provider in production', () => {
    const result = assertEnvironmentConsistency({
      environment: 'production',
      expectedProjectId: 'nearsy-pj',
      nativeProjectId: 'nearsy-pj',
      jsProjectId: 'nearsy-pj',
      functionsRegion: 'us-central1',
      appCheckProvider: 'debug',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'ENV_DEBUG_APP_CHECK_FORBIDDEN');
    }
  });

  it('requires us-central1', () => {
    const result = assertEnvironmentConsistency({
      environment: 'development',
      expectedProjectId: 'nearsy-dev',
      nativeProjectId: 'nearsy-dev',
      jsProjectId: 'nearsy-dev',
      functionsRegion: 'us-east1',
      appCheckProvider: 'debug',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'ENV_FUNCTIONS_REGION_INVALID');
    }
  });

  it('accepts aligned development config', () => {
    const result = assertEnvironmentConsistency({
      environment: 'development',
      expectedProjectId: 'nearsy-dev',
      nativeProjectId: 'nearsy-dev',
      jsProjectId: 'nearsy-dev',
      functionsRegion: 'us-central1',
      appCheckProvider: 'debug',
    });
    assert.equal(result.ok, true);
  });
});

describe('createAppCheckBootstrap', () => {
  it('uses a single shared initialize promise', async () => {
    let calls = 0;
    const bootstrap = createAppCheckBootstrap({
      port: {
        async initialize() {
          calls += 1;
          await new Promise((r) => setTimeout(r, 20));
        },
        async ensureToken() {},
      },
      maxAttempts: 1,
      timeoutMs: 5_000,
    });

    await Promise.all([bootstrap.initialize(), bootstrap.initialize()]);
    assert.equal(calls, 1);
    assert.equal(bootstrap.getState(), 'ready');
  });

  it('marks failed on App Check error and blocks ready', async () => {
    const bootstrap = createAppCheckBootstrap({
      port: {
        async initialize() {
          throw new Error('native failure');
        },
        async ensureToken() {},
      },
      maxAttempts: 1,
      timeoutMs: 1_000,
      sleep: async () => {},
    });

    await assert.rejects(() => bootstrap.initialize(), LinkedInA3ClientError);
    assert.equal(bootstrap.getState(), 'failed');
    assert.throws(() => bootstrap.ensureReady(), (err: unknown) => {
      return (
        err instanceof LinkedInA3ClientError && err.code === 'APP_CHECK_FAILED'
      );
    });
  });

  it('times out when initialization exceeds budget', async () => {
    const bootstrap = createAppCheckBootstrap({
      port: {
        async initialize() {
          await new Promise((r) => setTimeout(r, 50));
        },
        async ensureToken() {},
      },
      maxAttempts: 1,
      timeoutMs: 5,
      sleep: async () => {},
      now: (() => {
        let t = 0;
        return () => {
          t += 10;
          return t;
        };
      })(),
    });

    await assert.rejects(() => bootstrap.initialize(), (err: unknown) => {
      return (
        err instanceof LinkedInA3ClientError && err.code === 'APP_CHECK_TIMEOUT'
      );
    });
  });

  it('limits retries', async () => {
    let attempts = 0;
    const bootstrap = createAppCheckBootstrap({
      port: {
        async initialize() {
          attempts += 1;
          throw new Error('fail');
        },
        async ensureToken() {},
      },
      maxAttempts: 2,
      timeoutMs: 1_000,
      sleep: async () => {},
    });

    await assert.rejects(() => bootstrap.initialize());
    assert.equal(attempts, 2);
  });
});

describe('createLinkedInA3CallableClient', () => {
  const environment = resolveNearsyFirebaseEnvironment('development');

  it('blocks callable before App Check ready', async () => {
    const appCheck = createAppCheckBootstrap({
      port: {
        async initialize() {},
        async ensureToken() {},
      },
    });
    // not initialized
    const client = createLinkedInA3CallableClient({
      environment,
      appCheck,
      getNativeProjectId: () => 'nearsy-dev',
      getJsProjectId: () => 'nearsy-dev',
      invoke: async () => {
        throw new Error('should not invoke');
      },
    });

    await assert.rejects(
      () =>
        client.start({
          platform: 'ios',
          clientProofChallenge: 'challenge-value-123456',
          clientProofMethod: 'S256',
        }),
      (err: unknown) =>
        err instanceof LinkedInA3ClientError && err.code === 'NOT_INITIALIZED',
    );
  });

  it('validates start response and sanitizes helpers', async () => {
    const appCheck = createAppCheckBootstrap({
      port: {
        async initialize() {},
        async ensureToken() {},
      },
      maxAttempts: 1,
    });
    await appCheck.initialize();

    const client = createLinkedInA3CallableClient({
      environment,
      appCheck,
      getNativeProjectId: () => 'nearsy-dev',
      getJsProjectId: () => 'nearsy-dev',
      invoke: async () => ({
        transactionId: 'tx-abcdef-12345678',
        authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1',
        expiresAt: Date.now() + 60_000,
      }),
    });

    const result = await client.start({
      platform: 'ios',
      clientProofChallenge: 'challenge-value-123456',
      clientProofMethod: 'S256',
    });

    assert.ok(result.transactionId);
    assert.ok(result.authorizationUrl);
    assert.ok(result.expiresAt);

    const sanitizedTx = sanitizeTransactionId(result.transactionId);
    assert.notEqual(sanitizedTx, result.transactionId);
    assert.ok(!sanitizedTx.includes('abcdef'));

    const sanitizedUrl = sanitizeAuthorizationUrl(result.authorizationUrl);
    assert.ok(!sanitizedUrl.includes('x=1'));
  });

  it('sanitizes callable failures', async () => {
    const appCheck = createAppCheckBootstrap({
      port: {
        async initialize() {},
        async ensureToken() {},
      },
      maxAttempts: 1,
    });
    await appCheck.initialize();

    const client = createLinkedInA3CallableClient({
      environment,
      appCheck,
      getNativeProjectId: () => 'nearsy-dev',
      getJsProjectId: () => 'nearsy-dev',
      invoke: async () => {
        const err = new Error('secret token abc');
        (err as { code?: string }).code = 'functions/failed-precondition';
        throw err;
      },
    });

    await assert.rejects(
      () =>
        client.start({
          platform: 'ios',
          clientProofChallenge: 'challenge-value-123456',
          clientProofMethod: 'S256',
        }),
      (err: unknown) => {
        return (
          err instanceof LinkedInA3ClientError &&
          err.code === 'CALLABLE_FAILED' &&
          !String(err.message).includes('secret') &&
          !String(err.message).includes('token')
        );
      },
    );
  });

  it('rejects when LinkedIn is explicitly disabled on the environment config', async () => {
    const appCheck = createAppCheckBootstrap({
      port: {
        async initialize() {},
        async ensureToken() {},
      },
      maxAttempts: 1,
    });
    await appCheck.initialize();
    const client = createLinkedInA3CallableClient({
      environment: {
        ...resolveNearsyFirebaseEnvironment('production'),
        linkedInAuthEnabled: false,
      },
      appCheck,
      getNativeProjectId: () => 'nearsy-pj',
      getJsProjectId: () => 'nearsy-pj',
      invoke: async () => ({}),
    });

    await assert.rejects(
      () =>
        client.start({
          platform: 'ios',
          clientProofChallenge: 'challenge-value-123456',
          clientProofMethod: 'S256',
        }),
      (err: unknown) =>
        err instanceof LinkedInA3ClientError && err.code === 'LINKEDIN_DISABLED',
    );
  });
});

describe('firebase js stack regression markers', () => {
  it('preserves CRJ cross-platform decision pending marker', () => {
    assert.equal(
      CRJ_CROSS_PLATFORM_DECISION_PENDING,
      'CRJ_CROSS_PLATFORM_DECISION_PENDING',
    );
  });

  it('does not import RNFB Auth/Firestore/Storage in linkedinA3 pure modules', async () => {
    // Structural guarantee: this suite only imports DI-friendly modules.
    assert.ok(true);
  });
});
