/**
 * Normalized Visibility/Discovery callable errors (no Firebase imports).
 */

export type VisibilityFirebaseErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'resource-exhausted'
  | 'unavailable'
  | 'internal'
  | 'unknown';

/** Contractual `details.reason` values (known set). */
export type VisibilityKnownErrorReason =
  | 'contract-version-unsupported'
  | 'invalid-location'
  | 'invalid-request'
  | 'invalid-search-preferences'
  | 'invalid-candidate-uid'
  | 'profile-incomplete'
  | 'user-not-found'
  | 'visibility-inactive'
  | 'location-missing'
  | 'location-stale'
  | 'candidate-not-eligible'
  | 'candidate-blocked'
  | 'rate-limited'
  | 'invalid-response';

export type VisibilityErrorReason =
  | { kind: 'known'; value: VisibilityKnownErrorReason }
  | { kind: 'unknown'; value: string }
  | { kind: 'none' };

/** Stable client code from setActiveProfileMode PROFILE_INCOMPLETE details. */
export const PROFILE_INCOMPLETE_DETAILS_CODE = 'PROFILE_INCOMPLETE';

export const PROFILE_INCOMPLETE_MISSING_FIELDS = [
  'realName',
  'lastName',
  'profileImage',
  'occupation',
  'bio',
  'company',
] as const;

export type ProfileIncompleteMissingField =
  (typeof PROFILE_INCOMPLETE_MISSING_FIELDS)[number];

export type ProfileIncompleteDestinationMode = 'personal' | 'professional';

const KNOWN_REASONS = new Set<string>([
  'contract-version-unsupported',
  'invalid-location',
  'invalid-request',
  'invalid-search-preferences',
  'invalid-candidate-uid',
  'profile-incomplete',
  'user-not-found',
  'visibility-inactive',
  'location-missing',
  'location-stale',
  'candidate-not-eligible',
  'candidate-blocked',
  'rate-limited',
  'invalid-response',
]);

const KNOWN_CODES = new Set<string>([
  'unauthenticated',
  'permission-denied',
  'invalid-argument',
  'failed-precondition',
  'not-found',
  'resource-exhausted',
  'unavailable',
  'internal',
]);

export class VisibilityDiscoveryClientError extends Error {
  readonly kind = 'VisibilityDiscoveryClientError' as const;
  readonly code: VisibilityFirebaseErrorCode;
  readonly reason: VisibilityErrorReason;
  readonly field?: string;
  readonly retryable: boolean;
  /**
   * Raw `details.retryable` from transport when present.
   * Diagnostic only — must not override contractual retryable for invalid-location.
   */
  readonly detailsRetryableReceived?: boolean;
  /** Original throwable — logging only; never surface to UI. */
  readonly causeForLog?: unknown;
  /** `details.code` when present (`PROFILE_INCOMPLETE`). */
  readonly detailsCode?: string;
  /** Destination face that failed activation — not the still-active mode. */
  readonly destinationMode?: ProfileIncompleteDestinationMode;
  readonly missingFields?: ProfileIncompleteMissingField[];

  constructor(input: {
    code: VisibilityFirebaseErrorCode;
    reason?: VisibilityErrorReason;
    field?: string;
    retryable: boolean;
    detailsRetryableReceived?: boolean;
    message: string;
    causeForLog?: unknown;
    detailsCode?: string;
    destinationMode?: ProfileIncompleteDestinationMode;
    missingFields?: ProfileIncompleteMissingField[];
  }) {
    super(input.message);
    this.name = 'VisibilityDiscoveryClientError';
    this.code = input.code;
    this.reason = input.reason ?? { kind: 'none' };
    this.retryable = input.retryable;
    if (input.field !== undefined) this.field = input.field;
    if (input.detailsRetryableReceived !== undefined) {
      this.detailsRetryableReceived = input.detailsRetryableReceived;
    }
    if (input.causeForLog !== undefined) this.causeForLog = input.causeForLog;
    if (input.detailsCode !== undefined) this.detailsCode = input.detailsCode;
    if (input.destinationMode !== undefined) {
      this.destinationMode = input.destinationMode;
    }
    if (input.missingFields !== undefined) {
      this.missingFields = input.missingFields;
    }
  }
}

export function isVisibilityDiscoveryClientError(
  value: unknown,
): value is VisibilityDiscoveryClientError {
  return (
    value instanceof VisibilityDiscoveryClientError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as VisibilityDiscoveryClientError).kind ===
        'VisibilityDiscoveryClientError')
  );
}

export function parseKnownReason(raw: unknown): VisibilityErrorReason {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { kind: 'none' };
  }
  const value = raw.trim();
  if (KNOWN_REASONS.has(value)) {
    return { kind: 'known', value: value as VisibilityKnownErrorReason };
  }
  return { kind: 'unknown', value };
}

function defaultRetryableForReason(reason: VisibilityErrorReason): boolean {
  if (reason.kind !== 'known') return false;
  switch (reason.value) {
    case 'invalid-location':
    case 'location-stale':
    case 'rate-limited':
      return true;
    default:
      return false;
  }
}

function defaultRetryableForCode(code: VisibilityFirebaseErrorCode): boolean {
  return (
    code === 'unavailable' ||
    code === 'resource-exhausted' ||
    code === 'unknown'
  );
}

export function normalizeFirebaseErrorCode(
  raw: unknown,
): VisibilityFirebaseErrorCode {
  const text = String(raw ?? '')
    .trim()
    .replace(/^functions\//i, '')
    .toLowerCase()
    .replace(/_/g, '-');
  if (KNOWN_CODES.has(text)) {
    return text as VisibilityFirebaseErrorCode;
  }
  return 'unknown';
}

function readDetails(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== 'object') return null;
  const details = (err as { details?: unknown }).details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  return details as Record<string, unknown>;
}

const MISSING_FIELD_SET = new Set<string>(PROFILE_INCOMPLETE_MISSING_FIELDS);

export function parseProfileIncompleteDestinationMode(
  raw: unknown,
): ProfileIncompleteDestinationMode | undefined {
  return raw === 'personal' || raw === 'professional' ? raw : undefined;
}

export function parseProfileIncompleteMissingFields(
  raw: unknown,
): ProfileIncompleteMissingField[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const fields = raw.filter(
    (value): value is ProfileIncompleteMissingField =>
      typeof value === 'string' && MISSING_FIELD_SET.has(value),
  );
  return fields.length > 0 ? fields : undefined;
}

/**
 * Map RNFB / Firebase callable throwables into a discriminated client error.
 * Unknown reasons are preserved — never treated as success.
 *
 * Contract V3.0.1: `invalid-location` is always functionally retryable,
 * even if transport sends `details.retryable: false`.
 */
export function normalizeVisibilityCallableError(
  err: unknown,
): VisibilityDiscoveryClientError {
  if (isVisibilityDiscoveryClientError(err)) return err;

  const anyErr = err as { code?: unknown; message?: unknown };
  const code = normalizeFirebaseErrorCode(anyErr?.code);
  const details = readDetails(err);
  let reason = parseKnownReason(details?.reason);
  const detailsCode =
    typeof details?.code === 'string' && details.code.trim()
      ? details.code.trim()
      : undefined;
  if (
    reason.kind === 'none' &&
    detailsCode === PROFILE_INCOMPLETE_DETAILS_CODE
  ) {
    reason = { kind: 'known', value: 'profile-incomplete' };
  }
  const destinationMode = parseProfileIncompleteDestinationMode(details?.mode);
  const missingFields = parseProfileIncompleteMissingFields(
    details?.missingFields,
  );
  const field =
    typeof details?.field === 'string' && details.field.trim()
      ? details.field.trim()
      : missingFields?.[0];

  const detailsRetryableReceived =
    typeof details?.retryable === 'boolean' ? details.retryable : undefined;

  let retryable: boolean;
  if (reason.kind === 'known' && reason.value === 'invalid-location') {
    retryable = true;
  } else if (reason.kind === 'known' && reason.value === 'profile-incomplete') {
    retryable = false;
  } else if (detailsRetryableReceived !== undefined) {
    retryable = detailsRetryableReceived;
  } else if (reason.kind === 'known') {
    retryable = defaultRetryableForReason(reason);
  } else {
    retryable = defaultRetryableForCode(code);
  }

  return new VisibilityDiscoveryClientError({
    code,
    reason,
    field,
    retryable,
    detailsRetryableReceived,
    message:
      reason.kind === 'known' && reason.value === 'profile-incomplete'
        ? 'Destination profile is incomplete. (PROFILE_INCOMPLETE)'
        : 'Visibility callable failed.',
    causeForLog: err,
    ...(detailsCode ? { detailsCode } : {}),
    ...(destinationMode ? { destinationMode } : {}),
    ...(missingFields ? { missingFields } : {}),
  });
}

export function createContractResponseError(
  message = 'Invalid Visibility callable response.',
  causeForLog?: unknown,
): VisibilityDiscoveryClientError {
  return new VisibilityDiscoveryClientError({
    code: 'internal',
    reason: { kind: 'known', value: 'invalid-response' },
    retryable: false,
    message,
    causeForLog,
  });
}
