/**
 * Client contract for the `deleteMyAccount` callable (functions repo,
 * `modules/accountDeletion`). The backend is the only authority that deletes
 * Firebase Auth and account data; clients map `details.reason`, never messages.
 */

export const DELETE_MY_ACCOUNT_CALLABLE_NAME = 'deleteMyAccount' as const;

export const DELETE_MY_ACCOUNT_REGION = 'us-central1' as const;

/** Backend rejects sessions whose `auth_time` is older than this. */
export const DELETE_MY_ACCOUNT_MAX_AUTH_AGE_SECONDS = 300;

/**
 * Client-side freshness budget before skipping reauthentication. Leaves room
 * for device clock skew and request latency under the backend limit.
 */
export const DELETE_MY_ACCOUNT_CLIENT_FRESH_AUTH_SECONDS = 240;

/** Above the callable `timeoutSeconds` (120) so the client never aborts first. */
export const DELETE_MY_ACCOUNT_HTTP_TIMEOUT_MS = 130_000;

export const DELETE_MY_ACCOUNT_REASONS = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  APP_CHECK_REQUIRED: 'APP_CHECK_REQUIRED',
  RECENT_LOGIN_REQUIRED: 'RECENT_LOGIN_REQUIRED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DELETION_RETRYABLE: 'DELETION_RETRYABLE',
  DELETION_FAILED: 'DELETION_FAILED',
} as const;

export type DeleteMyAccountStatus = 'DELETED' | 'ALREADY_DELETED';

export type DeleteMyAccountSuccess = {
  ok: true;
  status: DeleteMyAccountStatus;
};

export type DeleteMyAccountFailureKind =
  | 'RECENT_LOGIN_REQUIRED'
  | 'APP_CHECK'
  | 'UNAUTHENTICATED'
  | 'IDENTITY_CHANGED'
  | 'IN_PROGRESS'
  | 'DELETION_RETRYABLE'
  | 'DELETION_FAILED'
  | 'NETWORK_UNCERTAIN'
  | 'UNKNOWN';

export class DeleteMyAccountError extends Error {
  readonly kind: DeleteMyAccountFailureKind;
  /**
   * False only when the backend provably deleted nothing (precondition
   * rejections, or the request was never sent).
   */
  readonly serverMayHaveDeleted: boolean;

  constructor(kind: DeleteMyAccountFailureKind, serverMayHaveDeleted: boolean) {
    super(`deleteMyAccount failed: ${kind}`);
    this.name = 'DeleteMyAccountError';
    this.kind = kind;
    this.serverMayHaveDeleted = serverMayHaveDeleted;
  }
}

export function isDeleteMyAccountError(value: unknown): value is DeleteMyAccountError {
  return (
    value instanceof DeleteMyAccountError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { name?: unknown }).name === 'DeleteMyAccountError' &&
      typeof (value as { kind?: unknown }).kind === 'string')
  );
}

export function parseDeleteMyAccountResponse(data: unknown): DeleteMyAccountSuccess {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as { ok?: unknown; status?: unknown };
    if (
      record.ok === true &&
      (record.status === 'DELETED' || record.status === 'ALREADY_DELETED')
    ) {
      return { ok: true, status: record.status };
    }
  }
  // A 200 we cannot read is not proof of deletion.
  throw new DeleteMyAccountError('UNKNOWN', true);
}

function readString(value: unknown, key: string): string {
  if (!value || typeof value !== 'object') return '';
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw : '';
}

/**
 * Map a transport / callable failure. Reads only `code` and `details.reason`;
 * backend and Firebase messages are never surfaced.
 */
export function mapDeleteMyAccountFailure(err: unknown): DeleteMyAccountError {
  if (isDeleteMyAccountError(err)) return err;

  const code = readString(err, 'code').replace(/^functions\//, '');
  const details =
    err && typeof err === 'object' ? (err as { details?: unknown }).details : undefined;
  const reason = readString(details, 'reason');

  switch (reason) {
    case DELETE_MY_ACCOUNT_REASONS.RECENT_LOGIN_REQUIRED:
      return new DeleteMyAccountError('RECENT_LOGIN_REQUIRED', false);
    case DELETE_MY_ACCOUNT_REASONS.APP_CHECK_REQUIRED:
      return new DeleteMyAccountError('APP_CHECK', false);
    case DELETE_MY_ACCOUNT_REASONS.UNAUTHENTICATED:
      return new DeleteMyAccountError('UNAUTHENTICATED', false);
    case DELETE_MY_ACCOUNT_REASONS.INVALID_ARGUMENT:
      return new DeleteMyAccountError('UNKNOWN', false);
    case DELETE_MY_ACCOUNT_REASONS.DELETION_RETRYABLE:
      return new DeleteMyAccountError('DELETION_RETRYABLE', true);
    case DELETE_MY_ACCOUNT_REASONS.DELETION_FAILED:
      return new DeleteMyAccountError('DELETION_FAILED', true);
    default:
      break;
  }

  // Framework-level rejections run before the handler, so nothing was deleted.
  if (code === 'unauthenticated') {
    return new DeleteMyAccountError('UNAUTHENTICATED', false);
  }
  if (code === 'permission-denied') {
    return new DeleteMyAccountError('UNKNOWN', false);
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new DeleteMyAccountError('NETWORK_UNCERTAIN', true);
  }
  return new DeleteMyAccountError('UNKNOWN', true);
}
