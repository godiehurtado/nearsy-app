import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildAppCheckFailureDiagnostic } from '../authentication/linkedinA3/appCheck/appCheckDiagnostics';
import { appCheckPortTelemetry } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { LinkedInA3ClientError } from '../authentication/linkedinA3/sanitize';
import { createContactsClientComposer } from '../contacts/contactsClientComposition';
import {
  appendContactsDiagnosticReference,
  createContactsOperationTrace,
  isContactsDiagnosticsActive,
  normalizeContactsDiagnosticCode,
  traceContactsAddressBook,
  traceContactsSession,
  type ContactsOperationTrace,
} from '../contacts/contactsDiagnostics';
import {
  isGenericContactsSyncError,
} from '../contacts/contactsErrorPresentation';
import {
  createContactsOperationRunner,
  driveContactsOperation,
  type ContactsOutcomeView,
} from '../contacts/contactsOperationCoordinator';
import { enableAndSyncContacts } from '../contacts/controller';
import { createMemoryContactsSessionStore } from '../contacts/fakeClient';
import { createSecureStoreContactsSessionStore } from '../contacts/iosContactsSession.ios';
import type {
  ContactsAddressBookPort,
  ContactsSessionStore,
} from '../contacts/port';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (path: string) => readFileSync(join(here, '..', path), 'utf8');

const REFERENCE_SHAPE = /^[a-z0-9_/-]+$/;

const SENSITIVE_MESSAGE = [
  'token eyJhbGciOiJSUzI1NiJ9.payload.signature',
  'uid-secret-123',
  'person@example.com',
  '+573001234567',
  'https://us-central1-nearsy-pj.cloudfunctions.net/refreshVerifiedActorKeys',
  'Ana Contact',
].join(' ');
const SENSITIVE_PARTS = [
  'eyJ',
  'uid-secret',
  'person',
  'example',
  '3001234567',
  'https',
  'cloudfunctions',
  'Ana',
];

function assertSafe(reference: string | null) {
  assert.ok(reference);
  assert.match(reference, REFERENCE_SHAPE);
  for (const part of SENSITIVE_PARTS) {
    assert.ok(!reference.includes(part), `leaked ${part}`);
  }
}

function nativeError(code: string, message = SENSITIVE_MESSAGE) {
  return Object.assign(new Error(message), { code });
}

function diagnosedAppCheckError(raw: Error, stage: 'get_token' | 'initialize_app_check') {
  const diagnostic = buildAppCheckFailureDiagnostic(raw, stage, 1);
  const wrapped = new LinkedInA3ClientError(
    'APP_CHECK_FAILED',
    diagnostic.safeMessage,
    diagnostic.nativeCode ?? diagnostic.normalizedCode,
  );
  return Object.assign(wrapped, { diagnostic });
}

type PortOverrides = {
  initialize?: () => Promise<void>;
  ensureToken?: () => Promise<void>;
  withTokenError?: Error;
};

function fakeNative(over: PortOverrides = {}, nativeProject = 'nearsy-pj') {
  return async () => ({
    port: {
      initialize: over.initialize ?? (async () => {}),
      ensureToken: over.ensureToken ?? (async () => {}),
      async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
        if (over.withTokenError) throw over.withTokenError;
        return fn('app-check-token-value');
      },
    },
    getNativeProjectId: () => nativeProject,
  });
}

type ComposerOverrides = {
  native?: () => ReturnType<ReturnType<typeof fakeNative>>;
  jsProject?: string;
  user?: { getIdToken: () => Promise<string> } | null;
  fetchImpl?: typeof fetch;
};

function composer(over: ComposerOverrides = {}) {
  return createContactsClientComposer({
    resolveEnvironment: () => ({
      environment: 'production',
      firebaseProjectId: 'nearsy-pj',
      region: 'us-central1',
    }),
    readJsProjectId: () => over.jsProject ?? 'nearsy-pj',
    createNativeAppCheckPort: over.native ?? fakeNative(),
    getCurrentUser: () =>
      over.user === undefined
        ? { getIdToken: async () => 'id-token-value' }
        : over.user,
    fetchImpl:
      over.fetchImpl ??
      (async () => {
        throw new Error('fetch must not run');
      }),
  });
}

const grantedBook: ContactsAddressBookPort = {
  getPermission: async () => 'granted',
  requestPermission: async () => 'granted',
  readRows: async () => [],
};
const emptySession = () =>
  createMemoryContactsSessionStore({ sourceId: null, contactsEpoch: null });

/** Runs one toggle through the real runner, coordinator and controller. */
async function toggle(
  comp: ReturnType<typeof composer>,
  over: {
    session?: ContactsSessionStore;
    book?: ContactsAddressBookPort;
    uid?: string;
  } = {},
) {
  const trace = createContactsOperationTrace();
  const views: ContactsOutcomeView[] = [];
  await driveContactsOperation({
    runner: createContactsOperationRunner(),
    uid: over.uid ?? 'u1',
    kind: 'enable',
    previousEnabled: false,
    waitMs: 2000,
    task: async () => {
      try {
        const client = await comp.getClient(trace);
        return await enableAndSyncContacts({
          client,
          session: traceContactsSession(over.session ?? emptySession(), trace),
          book: traceContactsAddressBook(over.book ?? grantedBook, trace),
          sleep: async () => {},
        });
      } catch (err) {
        trace.fail(err);
        throw err;
      }
    },
    isActive: () => true,
    readServerState: async () => ({ enabled: false, notifyNearbyContacts: false }),
    onView: (view) => views.push(view),
  });
  return { view: views[views.length - 1], reference: trace.reference() };
}

function assertSameUserOutcome(view: ContactsOutcomeView) {
  assert.equal(view.view, 'error');
  assert.equal(view.reason, 'contacts-invalid-response');
  assert.equal(view.enabled, false);
  assert.equal(view.retryKind, 'enable');
}

describe('Contacts diagnostic: failures before the request', () => {
  it('App Check initialization keeps its stage and code', async () => {
    const raw = nativeError('appCheck/invalid-configuration');
    const { view, reference } = await toggle(
      composer({
        native: fakeNative({
          initialize: async () => {
            throw diagnosedAppCheckError(raw, 'initialize_app_check');
          },
        }),
      }),
    );
    assertSameUserOutcome(view);
    // The native code is not listed, so the wrapper's own listed code is used.
    assert.equal(reference, 'app_check_init/app-check-failed');
    assertSafe(reference);
  });

  it('a forced token failure reports code, HTTP, status and exchange', async () => {
    const raw = nativeError(
      'appCheck/token-error',
      'Exchange failed firebaseappcheck.googleapis.com:exchangeAppAttestAssertion ' +
        'HTTP status code: 403 "status": "PERMISSION_DENIED" ' +
        SENSITIVE_MESSAGE,
    );
    const { view, reference } = await toggle(
      composer({
        native: fakeNative({
          ensureToken: async () => {
            throw diagnosedAppCheckError(raw, 'get_token');
          },
        }),
      }),
    );
    assertSameUserOutcome(view);
    assert.equal(
      reference,
      'app_check_force/token-error/http-403/permission-denied/app-attest',
    );
    assertSafe(reference);
  });

  it('a project mismatch names which check failed', async () => {
    const js = await toggle(composer({ jsProject: 'nearsy-dev' }));
    assertSameUserOutcome(js.view);
    assert.equal(js.reference, 'project_js/contacts-hmac-unavailable');

    const native = await toggle(composer({ native: fakeNative({}, 'nearsy-dev') }));
    assert.equal(native.reference, 'project_native/contacts-hmac-unavailable');
  });

  it('a native port import failure is its own stage', async () => {
    const { view, reference } = await toggle(
      composer({
        native: async () => {
          throw nativeError('MODULE_NOT_FOUND');
        },
      }),
    );
    assertSameUserOutcome(view);
    assert.equal(reference, 'native_port/other');
  });

  it('a SecureStore read failure keeps the native code, not its message', async () => {
    const session = createSecureStoreContactsSessionStore('u1', async () => ({
      getItemAsync: async () => {
        throw nativeError('ERR_KEY_CHAIN');
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    }));
    const { view, reference } = await toggle(composer(), { session });
    assertSameUserOutcome(view);
    assert.equal(reference, 'session_read/err-key-chain');
  });

  it('a permission read failure is identified', async () => {
    const { view, reference } = await toggle(composer(), {
      book: {
        ...grantedBook,
        getPermission: async () => {
          throw nativeError('ERR_NATIVE');
        },
      },
    });
    assertSameUserOutcome(view);
    assert.equal(reference, 'permission/other');
  });

  it('Auth and App Check token failures are told apart', async () => {
    const auth = await toggle(
      composer({
        user: {
          getIdToken: async () => {
            throw nativeError('auth/network-request-failed');
          },
        },
      }),
    );
    assertSameUserOutcome(auth.view);
    assert.equal(auth.reference, 'auth_token/network-request-failed');

    const appCheck = await toggle(
      composer({
        native: fakeNative({
          withTokenError: diagnosedAppCheckError(
            nativeError('appCheck/token-null'),
            'get_token',
          ),
        }),
      }),
    );
    assertSameUserOutcome(appCheck.view);
    assert.equal(appCheck.reference, 'app_check_token/token-null');
  });
});

describe('Contacts diagnostic: HTTP status', () => {
  it('a failed fetch never shows HTTP', async () => {
    const { view, reference } = await toggle(
      composer({
        fetchImpl: async () => {
          throw new TypeError('Network request failed');
        },
      }),
    );
    assertSameUserOutcome(view);
    assert.equal(reference, 'fetch/network');
  });

  it('an aborted fetch never shows HTTP', async () => {
    const { reference } = await toggle(
      composer({
        fetchImpl: async () => {
          throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        },
      }),
    );
    assert.equal(reference, 'fetch/aborted');
  });

  it('a real response shows its status', async () => {
    const { view, reference } = await toggle(
      composer({
        fetchImpl: async () => new Response('<html>Forbidden</html>', { status: 403 }),
      }),
    );
    assertSameUserOutcome(view);
    assert.equal(reference, 'response/permission-denied/http-403');
  });

  it('an unreadable 200 keeps the status of that response', async () => {
    const { view, reference } = await toggle(
      composer({
        fetchImpl: async () =>
          new Response(JSON.stringify({ result: { nope: true } }), { status: 200 }),
      }),
    );
    assertSameUserOutcome(view);
    assert.equal(reference, 'response/other/http-200');
  });

  it('a status from an earlier step does not carry into a later failure', () => {
    const trace = createContactsOperationTrace();
    trace.enter('fetch');
    trace.noteResponse(200);
    trace.enter('session_write');
    trace.fail(nativeError('ERR_KEY_CHAIN'));
    assert.equal(trace.reference(), 'session_write/err-key-chain');
  });

  it('App Check text without a status shows no HTTP', () => {
    const trace = createContactsOperationTrace();
    trace.enter('app_check_token');
    trace.fail(diagnosedAppCheckError(nativeError('appCheck/token-error'), 'get_token'));
    assert.equal(trace.reference(), 'app_check_token/token-error');
  });
});

describe('Contacts diagnostic: old diagnostics and isolation', () => {
  it('ignores a lastDiagnostic left by an earlier operation', async () => {
    const stale = buildAppCheckFailureDiagnostic(
      nativeError(
        'appCheck/token-error',
        'HTTP status code: 429 "status": "RESOURCE_EXHAUSTED"',
      ),
      'get_token',
      1,
    );
    appCheckPortTelemetry.lastDiagnostic = stale;
    try {
      const { reference } = await toggle(composer(), {
        book: {
          ...grantedBook,
          getPermission: async () => {
            throw new Error('native');
          },
        },
      });
      assert.equal(reference, 'permission/other');
    } finally {
      appCheckPortTelemetry.lastDiagnostic = null;
    }
    assert.ok(
      !readShared('contacts/contactsDiagnostics.ts').includes('.lastDiagnostic'),
    );
    assert.ok(
      !readShared('contacts/contactsClientComposition.ts').includes('.lastDiagnostic'),
    );
  });

  it('an operation that recovers does not inherit the previous failure', async () => {
    let failing = true;
    const comp = composer({
      native: fakeNative({
        ensureToken: async () => {
          if (failing) {
            throw diagnosedAppCheckError(nativeError('appCheck/token-error'), 'get_token');
          }
        },
      }),
      fetchImpl: async () => {
        throw new TypeError('Network request failed');
      },
    });
    const first = await toggle(comp);
    assert.equal(first.reference, 'app_check_force/token-error');

    failing = false;
    const second = await toggle(comp);
    assert.equal(second.reference, 'fetch/network');
  });

  it('accounts sharing one failed composition each get only their own trace', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const comp = composer({
      native: fakeNative({
        ensureToken: async () => {
          await gate;
          throw diagnosedAppCheckError(nativeError('appCheck/token-error'), 'get_token');
        },
      }),
    });
    const a = createContactsOperationTrace();
    const b = createContactsOperationTrace();
    const untouched = createContactsOperationTrace();
    const pending = [
      comp.getClient(a).catch(() => null),
      comp.getClient(b).catch(() => null),
    ];
    release();
    await Promise.all(pending);
    assert.equal(a.reference(), 'app_check_force/token-error');
    assert.equal(b.reference(), 'app_check_force/token-error');
    assert.equal(untouched.reference(), null);
  });

  it('one client request does not write into another operation trace', async () => {
    const comp = composer({
      fetchImpl: async () => new Response('x', { status: 503 }),
    });
    const a = createContactsOperationTrace();
    const b = createContactsOperationTrace();
    const clientA = await comp.getClient(a);
    await comp.getClient(b);
    b.enter('permission');
    await assert.rejects(clientA.refreshVerifiedActorKeys({}));
    assert.equal(a.reference(), 'response/unavailable/http-503');
    assert.equal(b.reference(), 'permission/other');
  });

  it('a double tap that joined a running operation has no reference', () => {
    assert.equal(createContactsOperationTrace().reference(), null);
  });

  it('an outer rewrap does not replace the failure of the same step', () => {
    const trace: ContactsOperationTrace = createContactsOperationTrace();
    trace.enter('fetch');
    trace.failTransport(new TypeError('Network request failed'));
    trace.fail(nativeError('functions/unavailable'));
    assert.equal(trace.reference(), 'fetch/network');
  });
});

describe('Contacts diagnostic: no sensitive output', () => {
  it('never takes text from messages or unlisted codes', () => {
    const hostile = [
      nativeError(SENSITIVE_MESSAGE),
      nativeError('person@example.com'),
      nativeError('https://nearsy.example/a?token=abc'),
      Object.assign(new Error(SENSITIVE_MESSAGE), { reason: SENSITIVE_MESSAGE }),
      Object.assign(new Error(SENSITIVE_MESSAGE), {
        cause: nativeError(SENSITIVE_MESSAGE),
      }),
      SENSITIVE_MESSAGE,
      null,
      undefined,
      42,
    ];
    for (const err of hostile) {
      assert.equal(normalizeContactsDiagnosticCode(err), 'other');
      const trace = createContactsOperationTrace();
      trace.enter('fetch');
      trace.fail(err);
      assertSafe(trace.reference());
    }
  });

  it('drops unlisted status, operation and malformed HTTP values', () => {
    const trace = createContactsOperationTrace();
    trace.enter('app_check_force');
    trace.fail(
      Object.assign(new Error(SENSITIVE_MESSAGE), {
        diagnostic: {
          nativeCode: SENSITIVE_MESSAGE,
          firebaseStatus: 'person@example.com',
          exchangeOperation: 'constructor',
          httpStatus: 9000,
        },
      }),
    );
    assert.equal(trace.reference(), 'app_check_force/other');
  });

  it('an unknown code becomes other, with its stage intact', () => {
    const trace = createContactsOperationTrace();
    trace.enter('session_read');
    trace.fail(nativeError('SOME_NEW_NATIVE_CODE'));
    assert.equal(trace.reference(), 'session_read/other');
  });
});

describe('Contacts diagnostic: visibility', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');

  it('is off without a valid, unexpired date', () => {
    for (const value of [undefined, null, '', 'true', '1', 'yes', '2026-13-99', 20261120]) {
      assert.equal(isContactsDiagnosticsActive(value, now), false);
    }
    assert.equal(isContactsDiagnosticsActive('2026-11-04', now), false);
    assert.equal(isContactsDiagnosticsActive('2026-11-05', now), true);
  });

  it('the reference appears only when visible and on the generic message', () => {
    const input = { visible: true, generic: true, reference: 'fetch/network' };
    assert.equal(appendContactsDiagnosticReference('M', input), 'M Ref: fetch/network');
    assert.equal(appendContactsDiagnosticReference('M', { ...input, visible: false }), 'M');
    assert.equal(appendContactsDiagnosticReference('M', { ...input, generic: false }), 'M');
    assert.equal(appendContactsDiagnosticReference('M', { ...input, reference: null }), 'M');
  });

  it('generic covers the fixed reason and unknown ones, not specific messages', () => {
    assert.equal(isGenericContactsSyncError('contacts-invalid-response'), true);
    assert.equal(isGenericContactsSyncError('something-new'), true);
    assert.equal(isGenericContactsSyncError('contacts-os-denied'), false);
    assert.equal(isGenericContactsSyncError('contacts-hmac-unavailable'), false);
  });

  it('the screen builds one trace per operation and reads the flag at display', () => {
    const screen = readShared('screens/MoreScreen.tsx');
    assert.match(screen, /const trace = createContactsOperationTrace\(\);/);
    assert.match(screen, /visible: isContactsDiagnosticsVisible\(\)/);
    assert.ok(!screen.includes('lastDiagnostic'));
  });
});
