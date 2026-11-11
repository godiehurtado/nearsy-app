import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { LinkedInA3ClientError } from '../authentication/linkedinA3/sanitize';
import {
  appendContactsDiagnosticReference,
  createContactsOperationTrace,
  createTracedFetch,
  isContactsDiagnosticsActive,
  tagContactsFailureStage,
  traceAppCheckPort,
  traceContactsAddressBook,
  traceContactsSession,
  traceContactsStep,
  type ContactsDiagnosticStage,
} from '../contacts/contactsDiagnostics';
import { invokeContactsHmacCallableHttp } from '../contacts/contactsCallableHttp';
import { createMemoryContactsSessionStore } from '../contacts/fakeClient';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, '..', path), 'utf8');

/** Mirrors the composition in iosContactsFoundation.ios.ts around App Check. */
async function composeAppCheck(port: Parameters<typeof traceAppCheckPort>[0]) {
  let stage: ContactsDiagnosticStage = 'native_port';
  try {
    const appCheck = createAppCheckBootstrap({
      port: traceAppCheckPort(port, (next) => {
        stage = next;
      }),
      sleep: async () => {},
    });
    await appCheck.initialize();
    return appCheck;
  } catch (err) {
    tagContactsFailureStage(err, stage);
    throw err;
  }
}

function nativeError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new LinkedInA3ClientError('APP_CHECK_FAILED', 'App Check failed.'), extra, {
    diagnostic: { nativeCode: code, ...((extra.diagnostic as object) ?? {}) },
  });
}

const PRIVATE = [
  'ana@example.com',
  '+573001234567',
  'https://us-central1-nearsy-pj.cloudfunctions.net/syncContactHashes',
  'uid-AbC123',
  'eyJhbGciOiJSUzI1NiJ9.token',
];

function assertSanitized(ref: string | null) {
  assert.ok(ref);
  assert.match(ref!, /^[a-z0-9_]+(\/[a-z0-9-]+)*$/);
  for (const secret of PRIVATE) assert.equal(ref!.includes(secret), false, secret);
}

describe('App Check steps are told apart', () => {
  it('initial setup failure', async () => {
    const trace = createContactsOperationTrace();
    trace.enter('env_config');
    const err = await composeAppCheck({
      initialize: async () => {
        throw nativeError('app-check-failed');
      },
      ensureToken: async () => {},
    }).catch((e) => e);
    trace.fail(err);
    assert.equal(trace.reference(), 'app_check_init/app-check-failed/k-coded');
  });

  it('forced refresh failure, with HTTP and Firebase status and exchange', async () => {
    const trace = createContactsOperationTrace();
    trace.enter('env_config');
    const err = await composeAppCheck({
      initialize: async () => {},
      ensureToken: async () => {
        throw nativeError('token-error', {
          diagnostic: { httpStatus: 403, firebaseStatus: 'PERMISSION_DENIED', exchangeOperation: 'exchangeAppAttestAssertion' },
        });
      },
    }).catch((e) => e);
    trace.fail(err);
    assert.equal(trace.reference(), 'app_check_force/token-error/http-403/permission-denied/app-attest/k-coded');
  });

  it('normal (cached) token failure at call time', async () => {
    const trace = createContactsOperationTrace();
    trace.enter('app_check_token');
    trace.fail(nativeError('token-null'));
    assert.equal(trace.reference(), 'app_check_token/token-null/k-coded');
  });
});

describe('SecureStore, permission, book, Auth and HTTP', () => {
  it('a Keychain read failure names the session step and the native code only', async () => {
    const trace = createContactsOperationTrace();
    const failing = traceContactsSession(
      {
        ...createMemoryContactsSessionStore(),
        load: async () => {
          const err = new Error('contacts-session-unavailable');
          (err as Error & { cause?: unknown }).cause = { code: 'ERR_KEY_CHAIN', message: 'secret ana@example.com' };
          throw err;
        },
      },
      trace,
    );
    await assert.rejects(failing.load(), /contacts-session-unavailable/);
    assert.equal(trace.reference(), 'session_read/err-key-chain/k-coded');
  });

  it('permission and book read failures', async () => {
    for (const [method, stage, message, code] of [
      ['getPermission', 'permission', 'boom', 'other'],
      ['readRows', 'contacts_read', 'contacts-read-unavailable', 'read-unavailable'],
      ['readRows', 'contacts_read', 'contacts-read-incomplete', 'read-incomplete'],
    ] as const) {
      const trace = createContactsOperationTrace();
      const book = traceContactsAddressBook(
        {
          getPermission: async () => {
            if (method === 'getPermission') throw new Error(message);
            return 'granted';
          },
          requestPermission: async () => 'granted',
          readRows: async () => {
            throw new Error(message);
          },
        },
        trace,
      );
      await assert.rejects(method === 'getPermission' ? book.getPermission() : book.readRows());
      assert.equal(trace.reference(), `${stage}/${code}/k-error`);
    }
  });

  it('Auth token failure', () => {
    const trace = createContactsOperationTrace();
    trace.enter('auth_token');
    trace.fail({ code: 'auth/network-request-failed', message: 'ana@example.com' });
    assert.equal(trace.reference(), 'auth_token/network-request-failed/k-coded');
  });

  it('transport: no response vs an HTTP response from Identity', async () => {
    const offline = createContactsOperationTrace();
    await assert.rejects(
      invokeContactsHmacCallableHttp(
        {
          projectId: 'nearsy-pj',
          environment: 'production',
          functionName: 'enableContactsSync',
          idToken: 'id',
          appCheckToken: 'ac',
          data: { contactsEpoch: 0 },
        },
        {
          fetchImpl: createTracedFetch(offline, async () => {
            throw new TypeError('Network request failed');
          }),
        },
      ),
    );
    assert.equal(offline.reference(), 'fetch/network/k-typeerror');

    const rejected = createContactsOperationTrace();
    const err = await invokeContactsHmacCallableHttp(
      {
        projectId: 'nearsy-pj',
        environment: 'production',
        functionName: 'syncContactHashes',
        idToken: 'id',
        appCheckToken: 'ac',
        data: {},
      },
      {
        fetchImpl: createTracedFetch(rejected, async () =>
          new Response(
            JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Rejected. (contacts-identifier-invalid)', details: { reason: 'contacts-identifier-invalid' } } }),
            { status: 400 },
          ),
        ),
      },
    ).catch((e) => e);
    rejected.fail(err);
    assert.equal(err.reason ?? err.code, 'contacts-identifier-invalid');
    assert.match(rejected.reference()!, /^response\/contacts-identifier-invalid\/http-400/);
  });
});

describe('the reference never carries private data', () => {
  it('only closed-list values reach it', () => {
    const trace = createContactsOperationTrace();
    trace.enter('endpoint');
    trace.fail(Object.assign(new Error(PRIVATE.join(' ')), { code: PRIVATE[2], reason: PRIVATE[0] }));
    assertSanitized(trace.reference());
    assert.equal(trace.reference(), 'endpoint/other/k-coded');
  });

  it('the error is rethrown untouched', async () => {
    const original = new Error('kept');
    const trace = createContactsOperationTrace();
    const session = traceContactsSession(
      { ...createMemoryContactsSessionStore(), load: async () => { throw original; } },
      trace,
    );
    await assert.rejects(session.load(), (err) => err === original);
  });
});

describe('visibility', () => {
  it('only before the embedded expiry, and only when visible', () => {
    const now = Date.parse('2026-11-10T21:00:00.000Z');
    assert.equal(isContactsDiagnosticsActive('2026-11-17T21:00:00.000Z', now), true);
    assert.equal(isContactsDiagnosticsActive('2026-11-10T20:59:59.999Z', now), false);
    assert.equal(isContactsDiagnosticsActive(undefined, now), false);
    assert.equal(isContactsDiagnosticsActive('soon', now), false);
    const msg = 'Could not sync contacts. Try again.';
    assert.equal(
      appendContactsDiagnosticReference(msg, { visible: true, generic: true, reference: 'session_read/err-key-chain' }),
      `${msg} Ref: session_read/err-key-chain`,
    );
    assert.equal(appendContactsDiagnosticReference(msg, { visible: false, generic: true, reference: 'x' }), msg);
  });

  it('More appends it to Contacts error alerts and passes one trace per operation', () => {
    const more = read('screens/MoreScreen.tsx');
    assert.match(more, /const trace = createContactsOperationTrace\(\);/);
    assert.match(more, /client: await getContactsHmacClient\(trace\)/);
    assert.match(more, /traceContactsSession\(createContactsSessionStore\(uid\), trace\)/);
    assert.match(more, /traceContactsAddressBook\(createContactsAddressBookPort\(\), trace\)/);
    assert.match(more, /visible: isContactsDiagnosticsVisible\(\)/);
    assert.match(more, /onView: \(view\) => applyContactsView\(view, trace\)/);
  });

  it('the iOS foundation keeps its steps and only adds tracing', () => {
    const foundation = read('contacts/iosContactsFoundation.ios.ts');
    assert.match(foundation, /trace: ContactsOperationTrace = NOOP_CONTACTS_TRACE/);
    assert.match(foundation, /createAppCheckBootstrap\(\{\s*port: traceAppCheckPort\(port,/);
    assert.match(foundation, /appCheck\.ensureReady\(\);/);
    assert.match(foundation, /port\.withToken\(\(appCheckToken\) =>/);
    assert.match(foundation, /tagContactsFailureStage\(err, stage\)/);
    assert.match(foundation, /compositionPromise = null;\s*throw err;/);
  });
});

describe('trace v2: first failure, causing step, unknown', () => {
  const okSession = () =>
    traceContactsSession(createMemoryContactsSessionStore(), createContactsOperationTrace());

  it('an error after a successful session read is never reported as session_read', async () => {
    const trace = createContactsOperationTrace();
    const session = traceContactsSession(createMemoryContactsSessionStore(), trace);
    await session.load();
    // Gap between steps, thrown and caught by the outer runner.
    const gap = new TypeError('x');
    trace.failOutside(gap);
    assert.equal(trace.reference(), 'unknown/other/k-typeerror/after-session_read');
  });

  it('a failure returned without an exception shows unknown and the outcome reason', async () => {
    const trace = createContactsOperationTrace();
    const session = traceContactsSession(createMemoryContactsSessionStore(), trace);
    await session.load();
    assert.equal(
      trace.reference({ reason: 'contacts-invalid-response' }),
      'unknown/contacts-invalid-response/k-none/after-session_read',
    );
    // A reason outside the closed list is never printed.
    assert.equal(trace.reference({ reason: 'secret ana@example.com' }), 'unknown/other/k-none/after-session_read');
  });

  it('a step still running when the operation ends is named as running, not as the cause', () => {
    const trace = createContactsOperationTrace();
    trace.enter('session_read');
    assert.equal(
      trace.reference({ reason: 'contacts-timeout' }),
      'unknown/contacts-timeout/k-none/during-session_read',
    );
  });

  it('the first failure survives later steps and later failures', async () => {
    const trace = createContactsOperationTrace();
    trace.enter('auth_token');
    trace.fail({ code: 'auth/network-request-failed' });
    trace.done();
    const session = traceContactsSession(createMemoryContactsSessionStore(), trace);
    await session.load();
    await session.update((c) => c ?? ({} as any)).catch(() => {});
    trace.failOutside(new RangeError('later'));
    assert.equal(trace.reference(), 'auth_token/network-request-failed/k-coded');
  });

  it('a failure inside a step names that step', async () => {
    const trace = createContactsOperationTrace();
    await assert.rejects(
      traceContactsStep(trace, 'phone_region', async () => {
        throw new TypeError('x');
      }),
    );
    assert.equal(trace.reference(), 'phone_region/other/k-typeerror');
  });

  it('wrappers keep the kind of what they wrap', async () => {
    const { ContactsHmacClientError } = await import('../contacts/errors');
    const { createContactsHmacCallableClient } = await import('../contacts/adapter');
    const trace = createContactsOperationTrace();
    const client = createContactsHmacCallableClient({
      invoke: async () => {
        throw new TypeError('inner');
      },
    });
    const err = await client.refreshVerifiedActorKeys({}).catch((e) => e);
    assert.ok(err instanceof ContactsHmacClientError);
    trace.failOutside(err);
    assert.equal(trace.reference(), 'unknown/contacts-invalid-response/k-typeerror');
    void okSession;
  });

  it('an operation that ran no step has no reference', () => {
    assert.equal(createContactsOperationTrace().reference({ reason: 'contacts-invalid-response' }), null);
  });

  it('More records outside failures as outside and passes the outcome reason', () => {
    const more = read('screens/MoreScreen.tsx');
    assert.match(more, /trace\.failOutside\(err\);/);
    assert.equal(/catch \(err\) \{\s*trace\.fail\(err\);/.test(more), false);
    assert.match(more, /reference: trace\.reference\(\{ reason \}\)/);
    const foundation = read('contacts/iosContactsFoundation.ios.ts');
    assert.equal(foundation.match(/trace\.done\(\);/g)?.length, 4);
  });
});
