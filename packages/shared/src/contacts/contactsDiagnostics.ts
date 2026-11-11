/**
 * Per-operation diagnostic reference for Contacts failures that end in the
 * generic message. Observes only: it rethrows every error untouched and never
 * changes reason, toggle, consent, retries, persistence or network calls.
 *
 * Output comes from closed lists. Error messages are never read into it, so
 * native text, UIDs, tokens, URLs and contact data cannot reach the reference.
 */

import type { AppCheckBootstrapPort } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import type {
  ContactsAddressBookPort,
  ContactsSessionStore,
} from './port';

const CONTACTS_DIAGNOSTIC_STAGES = [
  'env_config',
  'project_js',
  'native_port',
  'project_native',
  'app_check_init',
  'app_check_force',
  'app_check_token',
  'auth_token',
  'endpoint',
  'fetch',
  'response',
  'session_read',
  'session_write',
  'permission',
  'phone_region',
  'contacts_read',
  'other',
] as const;

export type ContactsDiagnosticStage = (typeof CONTACTS_DIAGNOSTIC_STAGES)[number];

const STAGES = new Set<string>(CONTACTS_DIAGNOSTIC_STAGES);

const CODES = new Set<string>([
  // App Check, native and bootstrap.
  'token-error',
  'token-null',
  'already-initialized',
  'app-check-failed',
  'app-check-timeout',
  'not-initialized',
  'initializing',
  // Callable HTTP.
  'unauthenticated',
  'permission-denied',
  'unavailable',
  'internal',
  'failed-precondition',
  'invalid-argument',
  'not-found',
  'resource-exhausted',
  'deadline-exceeded',
  'cancelled',
  'unknown',
  // Firebase Auth.
  'network-request-failed',
  'user-token-expired',
  'invalid-user-token',
  'user-disabled',
  'too-many-requests',
  'internal-error',
  // expo-secure-store.
  'err-key-chain',
  'err-invalid-key',
  'err-missing-plist-key',
  'err-sec-access-control',
  // Contacts client and Identity reason tokens.
  'contacts-unauthenticated',
  'contacts-account-gone',
  'contacts-not-enabled',
  'contacts-epoch-mismatch',
  'contacts-epoch-required',
  'contacts-snapshot-stale',
  'contacts-snapshot-conflict',
  'contacts-source-removed',
  'contacts-source-cap',
  'contacts-identifier-cap',
  'contacts-union-cap',
  'contacts-identifier-invalid',
  'contacts-client-hash-rejected',
  'contacts-hmac-unavailable',
  'contacts-auth-lookup-failed',
  'contacts-rate-limited',
  'contacts-invalid-response',
]);

const FIREBASE_STATUSES = new Set<string>([
  'INVALID_ARGUMENT',
  'FAILED_PRECONDITION',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'UNKNOWN',
]);

const EXCHANGE_OPERATIONS: Record<string, string> = {
  exchangeAppAttestAssertion: 'app-attest',
  exchangeDeviceCheckToken: 'device-check',
};

/** Messages this app throws itself, mapped to codes. Nothing else is read. */
const OWN_MESSAGE_CODES: Record<string, string> = {
  'contacts-session-unavailable': 'session-unavailable',
  'contacts-read-unavailable': 'read-unavailable',
  'contacts-read-incomplete': 'read-incomplete',
};

type ErrorFields = {
  diagnostic?: {
    nativeCode?: unknown;
    httpStatus?: unknown;
    firebaseStatus?: unknown;
    exchangeOperation?: unknown;
  };
  causeCode?: unknown;
  code?: unknown;
  reason?: unknown;
  cause?: unknown;
  message?: unknown;
  name?: unknown;
};

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw
    .trim()
    .toLowerCase()
    .replace(/^(functions|appcheck|auth)\//, '')
    .replace(/_/g, '-');
  return CODES.has(code) ? code : null;
}

function asFields(err: unknown): ErrorFields | null {
  return err !== null && typeof err === 'object' ? (err as ErrorFields) : null;
}

/** First listed code on the error or its direct cause; anything else is `other`. */
export function normalizeContactsDiagnosticCode(err: unknown): string {
  const fields = asFields(err);
  if (!fields) return 'other';
  const cause = asFields(fields.cause);
  const candidates = [
    fields.diagnostic?.nativeCode,
    fields.causeCode,
    cause?.code,
    fields.code,
    fields.reason,
  ];
  for (const candidate of candidates) {
    const code = normalizeCode(candidate);
    if (code) return code;
  }
  // Exact match against our own constants: the message itself is never emitted.
  return OWN_MESSAGE_CODES[String(fields.message)] ?? 'other';
}

function validHttpStatus(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

function firebaseStatusOf(fields: ErrorFields | null): string | null {
  const status = fields?.diagnostic?.firebaseStatus;
  return typeof status === 'string' && FIREBASE_STATUSES.has(status)
    ? status.toLowerCase().replace(/_/g, '-')
    : null;
}

function exchangeOperationOf(fields: ErrorFields | null): string | null {
  const operation = fields?.diagnostic?.exchangeOperation;
  return typeof operation === 'string' &&
    Object.prototype.hasOwnProperty.call(EXCHANGE_OPERATIONS, operation)
    ? EXCHANGE_OPERATIONS[operation]
    : null;
}

/**
 * The stage belongs to the failed attempt, carried on the error, because
 * operations waiting on one shared composition all receive that same error.
 */
const failureStages = new WeakMap<object, ContactsDiagnosticStage>();

export function tagContactsFailureStage(
  err: unknown,
  stage: ContactsDiagnosticStage,
): void {
  if (err !== null && typeof err === 'object') failureStages.set(err, stage);
}

type RecordedFailure = {
  stage: ContactsDiagnosticStage;
  code: string;
  firebaseStatus: string | null;
  exchangeOperation: string | null;
  httpStatus: number | null;
};

export type ContactsOperationTrace = {
  /** Starts a step. What an earlier step recorded no longer speaks for this one. */
  enter(stage: ContactsDiagnosticStage): void;
  /** Records the first failure of the current step; outer rewraps do not replace it. */
  fail(err: unknown): void;
  /** Records a fetch that got no response, so there is never an HTTP status. */
  failTransport(err: unknown): void;
  /** Records a real HTTP response. */
  noteResponse(status: number): void;
  /** Null when this operation ran no step, such as a double tap that joined one. */
  reference(): string | null;
};

export function createContactsOperationTrace(): ContactsOperationTrace {
  let stage: ContactsDiagnosticStage | null = null;
  let responseStatus: number | null = null;
  let failure: RecordedFailure | null = null;

  const record = (err: unknown, code: string) => {
    if (failure) return;
    const fields = asFields(err);
    const tagged =
      err !== null && typeof err === 'object' ? failureStages.get(err) : undefined;
    const failedStage = tagged ?? stage ?? 'other';
    failure = {
      stage: STAGES.has(failedStage) ? failedStage : 'other',
      code,
      firebaseStatus: firebaseStatusOf(fields),
      exchangeOperation: exchangeOperationOf(fields),
      httpStatus: responseStatus ?? validHttpStatus(fields?.diagnostic?.httpStatus),
    };
  };

  return {
    enter(next) {
      stage = next;
      responseStatus = null;
      failure = null;
    },
    fail(err) {
      record(err, normalizeContactsDiagnosticCode(err));
    },
    failTransport(err) {
      record(err, asFields(err)?.name === 'AbortError' ? 'aborted' : 'network');
    },
    noteResponse(status) {
      stage = 'response';
      failure = null;
      responseStatus = validHttpStatus(status);
    },
    reference() {
      if (stage === null && failure === null) return null;
      const current: RecordedFailure = failure ?? {
        stage: stage ?? 'other',
        code: 'other',
        firebaseStatus: null,
        exchangeOperation: null,
        httpStatus: responseStatus,
      };
      return [
        current.stage,
        current.code,
        current.httpStatus === null ? null : `http-${current.httpStatus}`,
        current.firebaseStatus,
        current.exchangeOperation,
      ]
        .filter((part): part is string => part !== null)
        .join('/');
    },
  };
}

export const NOOP_CONTACTS_TRACE: ContactsOperationTrace = {
  enter() {},
  fail() {},
  failTransport() {},
  noteResponse() {},
  reference: () => null,
};

/** Reports which App Check step is running; the port is otherwise unchanged. */
export function traceAppCheckPort(
  port: AppCheckBootstrapPort,
  onStage: (stage: ContactsDiagnosticStage) => void,
): AppCheckBootstrapPort {
  return {
    ...port,
    initialize() {
      onStage('app_check_init');
      return port.initialize();
    },
    ensureToken() {
      onStage('app_check_force');
      return port.ensureToken();
    },
  };
}

/** Same request and same result as `fetchImpl`. */
export function createTracedFetch(
  trace: ContactsOperationTrace,
  fetchImpl: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    trace.enter('fetch');
    try {
      const response = await fetchImpl(input, init);
      trace.noteResponse(response.status);
      return response;
    } catch (err) {
      trace.failTransport(err);
      throw err;
    }
  };
}

/** Runs one traced step from outside this module. */
export function traceContactsStep<T>(
  trace: ContactsOperationTrace,
  stage: ContactsDiagnosticStage,
  work: () => Promise<T>,
): Promise<T> {
  return step(trace, stage, work);
}

async function step<T>(
  trace: ContactsOperationTrace,
  stage: ContactsDiagnosticStage,
  work: () => Promise<T>,
): Promise<T> {
  trace.enter(stage);
  try {
    return await work();
  } catch (err) {
    trace.fail(err);
    throw err;
  }
}

export function traceContactsSession(
  session: ContactsSessionStore,
  trace: ContactsOperationTrace,
): ContactsSessionStore {
  return {
    load: () => step(trace, 'session_read', () => session.load()),
    update: (mutate) => step(trace, 'session_write', () => session.update(mutate)),
    save: (snapshot) => step(trace, 'session_write', () => session.save(snapshot)),
    clearFingerprint: () =>
      step(trace, 'session_write', () => session.clearFingerprint()),
    forgetEpoch: () => step(trace, 'session_write', () => session.forgetEpoch()),
  };
}

export function traceContactsAddressBook(
  book: ContactsAddressBookPort,
  trace: ContactsOperationTrace,
): ContactsAddressBookPort {
  return {
    getPermission: () => step(trace, 'permission', () => book.getPermission()),
    requestPermission: () =>
      step(trace, 'permission', () => book.requestPermission()),
    readRows: () => step(trace, 'contacts_read', () => book.readRows()),
  };
}

/**
 * Visible only until the exact UTC instant set at build time. Missing or
 * malformed means off.
 */
export function isContactsDiagnosticsActive(
  until: unknown,
  nowMs: number,
): boolean {
  if (
    typeof until !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(until)
  ) {
    return false;
  }
  const end = Date.parse(until);
  return Number.isFinite(end) && nowMs < end;
}

export function appendContactsDiagnosticReference(
  message: string,
  input: { visible: boolean; generic: boolean; reference: string | null },
): string {
  return input.visible && input.generic && input.reference
    ? `${message} Ref: ${input.reference}`
    : message;
}
