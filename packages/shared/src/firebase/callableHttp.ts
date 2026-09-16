/**
 * Shared Firebase HTTPS callable HTTP protocol.
 *
 * Used when RNFB Auth is shimmed (iOS Firebase JS owns the session) so
 * RNFB httpsCallable cannot populate request.auth. Callers send:
 * - Authorization: Bearer <JS ID token>
 * - X-Firebase-AppCheck: <App Check token>
 *
 * Tokens must never be logged or embedded in thrown messages.
 */

export const DEFAULT_CALLABLE_HTTP_TIMEOUT_MS = 30_000;

export type FirebaseCallableHttpErrorInput = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  httpStatus?: number;
};

/**
 * Transport-shaped error compatible with Firebase callable normalizers.
 * `message` must never contain token material.
 */
export class FirebaseCallableHttpError extends Error {
  readonly kind = 'FirebaseCallableHttpError' as const;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly httpStatus?: number;

  constructor(input: FirebaseCallableHttpErrorInput) {
    super(sanitizeCallableErrorMessage(input.message));
    this.name = 'FirebaseCallableHttpError';
    this.code = input.code;
    if (input.details !== undefined) this.details = input.details;
    if (input.httpStatus !== undefined) this.httpStatus = input.httpStatus;
  }
}

export function isFirebaseCallableHttpError(
  value: unknown,
): value is FirebaseCallableHttpError {
  return (
    value instanceof FirebaseCallableHttpError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as FirebaseCallableHttpError).kind === 'FirebaseCallableHttpError')
  );
}

/** Strip accidental token-like substrings from error messages. */
export function sanitizeCallableErrorMessage(message: string): string {
  return String(message ?? '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .slice(0, 240);
}

export function buildCloudFunctionsCallableUrl(
  projectId: string,
  region: string,
  functionName: string,
): string {
  const project = projectId.trim().toLowerCase();
  const regionNorm = region.trim().toLowerCase();
  const name = functionName.trim();
  if (!project) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'Callable projectId is required.',
    });
  }
  if (!regionNorm) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'Callable region is required.',
    });
  }
  if (!name) {
    throw new FirebaseCallableHttpError({
      code: 'functions/invalid-argument',
      message: 'Callable function name is required.',
    });
  }
  return `https://${regionNorm}-${project}.cloudfunctions.net/${name}`;
}

export function buildEmulatorFunctionsCallableUrl(
  host: string,
  port: number,
  projectId: string,
  region: string,
  functionName: string,
): string {
  const h = host.trim();
  const project = projectId.trim().toLowerCase();
  const regionNorm = region.trim().toLowerCase();
  const name = functionName.trim();
  if (!h || !Number.isFinite(port) || port <= 0) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'Callable emulator host/port are invalid.',
    });
  }
  if (!project || !regionNorm || !name) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'Callable emulator URL requires project, region, and name.',
    });
  }
  return `http://${h}:${port}/${project}/${regionNorm}/${name}`;
}

function extractCallableErrorDetails(
  details: unknown,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  if (Array.isArray(details)) {
    for (const item of details) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const bag = item as Record<string, unknown>;
        if (
          typeof bag.reason === 'string' ||
          typeof bag.field === 'string' ||
          typeof bag.retryable === 'boolean'
        ) {
          return bag;
        }
      }
    }
    const first = details.find(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
    return first ? (first as Record<string, unknown>) : undefined;
  }
  if (typeof details === 'object' && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return undefined;
}

export function statusToFunctionsErrorCode(statusOrCode: unknown): string {
  const raw = String(statusOrCode ?? '')
    .trim()
    .replace(/^functions\//i, '');
  if (!raw) return 'functions/unknown';
  const normalized = raw.toLowerCase().replace(/_/g, '-');
  return `functions/${normalized}`;
}

/**
 * Unwrap Firebase callable HTTP body `{ result }` (not RNFB `{ data }`).
 */
export function unwrapFirebaseCallableHttpBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new FirebaseCallableHttpError({
      code: 'functions/internal',
      message: 'Invalid callable HTTP response.',
    });
  }
  const raw = body as { result?: unknown; error?: unknown; data?: unknown };
  if (raw.error && typeof raw.error === 'object' && !Array.isArray(raw.error)) {
    const err = raw.error as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    throw new FirebaseCallableHttpError({
      code: statusToFunctionsErrorCode(err.status ?? err.code),
      message:
        typeof err.message === 'string' && err.message.trim()
          ? err.message
          : 'Callable failed.',
      details: extractCallableErrorDetails(err.details),
    });
  }
  if ('result' in raw) return raw.result;
  // Reject RNFB `{ data }` wrappers — that shape hid the JS-auth gap.
  throw new FirebaseCallableHttpError({
    code: 'functions/internal',
    message: 'Invalid callable HTTP response.',
  });
}

export type InvokeFirebaseCallableHttpInput = {
  url: string;
  idToken: string;
  appCheckToken: string;
  data: Record<string, unknown>;
  timeoutMs?: number;
};

export type InvokeFirebaseCallableHttpDeps = {
  fetchImpl?: typeof fetch;
};

export async function invokeFirebaseCallableHttp(
  input: InvokeFirebaseCallableHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw new FirebaseCallableHttpError({
      code: 'functions/unauthenticated',
      message: 'Callable requires sign-in.',
    });
  }
  if (!input.appCheckToken.trim()) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'Callable App Check token is required.',
    });
  }
  if (!input.url.trim()) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'Callable URL is required.',
    });
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_CALLABLE_HTTP_TIMEOUT_MS;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller &&
    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.idToken}`,
        'X-Firebase-AppCheck': input.appCheckToken,
      },
      body: JSON.stringify({ data: input.data }),
      signal: controller?.signal,
    });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      (err as { name?: string }).name === 'AbortError'
    ) {
      throw new FirebaseCallableHttpError({
        code: 'functions/unavailable',
        message: 'Callable request timed out.',
      });
    }
    throw new FirebaseCallableHttpError({
      code: 'functions/unavailable',
      message: 'Callable network request failed.',
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const hasCallableError =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'error' in (parsed as object);
    if (hasCallableError) {
      try {
        unwrapFirebaseCallableHttpBody(parsed);
      } catch (err) {
        if (isFirebaseCallableHttpError(err)) {
          throw new FirebaseCallableHttpError({
            code: err.code,
            message: err.message,
            details: err.details,
            httpStatus: response.status,
          });
        }
      }
    }
    if (response.status === 401) {
      throw new FirebaseCallableHttpError({
        code: 'functions/unauthenticated',
        message: 'Callable requires sign-in.',
        httpStatus: 401,
      });
    }
    if (response.status === 403) {
      throw new FirebaseCallableHttpError({
        code: 'functions/permission-denied',
        message: 'Callable permission denied.',
        httpStatus: 403,
      });
    }
    throw new FirebaseCallableHttpError({
      code: 'functions/unavailable',
      message: 'Callable is unavailable.',
      httpStatus: response.status,
    });
  }

  return unwrapFirebaseCallableHttpBody(parsed);
}
