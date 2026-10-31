/**
 * Last-moment this-device push-token release around a Firebase session replace.
 *
 * Firestore owner rules allow delete of users/{uid}/pushTokens/{token} only while
 * request.auth.uid === uid. After signInWithCredential / signInWithCustomToken
 * the listener may already observe B, so A cannot be deleted from there.
 *
 * Default handlers are no-ops so Node auth-adapter tests stay Firebase-free.
 * The live session binds real handlers from pushTokens.ts.
 *
 * Logout and account deletion do not use this wrap: a push failure must not
 * block sign-out or account closure.
 */

import {
  mayReplaceFirebaseSession,
  type PushTokenAuthReplacePreparation,
} from './pushTokenLifecycle';

export type { PushTokenAuthReplacePreparation };

export const PUSH_TOKEN_RELEASE_UNCONFIRMED_CODE =
  'push-token-release-unconfirmed';
export const PUSH_TOKEN_RELEASE_UNCONFIRMED_MESSAGE_KEY =
  'authentication.errors.pushTokenReleaseUnconfirmed';

export class PushTokenReleaseUnconfirmedError extends Error {
  readonly code = PUSH_TOKEN_RELEASE_UNCONFIRMED_CODE;
  readonly recoverable = true;
  readonly messageKey = PUSH_TOKEN_RELEASE_UNCONFIRMED_MESSAGE_KEY;

  constructor() {
    super(PUSH_TOKEN_RELEASE_UNCONFIRMED_CODE);
    this.name = 'PushTokenReleaseUnconfirmedError';
  }
}

export function isPushTokenReleaseUnconfirmedError(
  err: unknown,
): err is PushTokenReleaseUnconfirmedError {
  return (
    err instanceof PushTokenReleaseUnconfirmedError ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === PUSH_TOKEN_RELEASE_UNCONFIRMED_CODE)
  );
}

export type PushTokenAuthReplaceHandlers = {
  prepare: () => Promise<PushTokenAuthReplacePreparation>;
  restore: (
    prepared: PushTokenAuthReplacePreparation,
  ) => Promise<unknown>;
};

const noopHandlers: PushTokenAuthReplaceHandlers = {
  prepare: async () => ({ previousUid: null, released: false }),
  restore: async () => undefined,
};

let handlers: PushTokenAuthReplaceHandlers = noopHandlers;

export function bindPushTokenAuthReplaceHandlers(
  next: PushTokenAuthReplaceHandlers,
): void {
  handlers = next;
}

export function resetPushTokenAuthReplaceHandlersForTests(): void {
  handlers = noopHandlers;
}

export function prepareThisDevicePushTokenForIncomingAuth(): Promise<PushTokenAuthReplacePreparation> {
  return handlers.prepare();
}

export function restoreThisDevicePushTokenAfterAbortedAuth(
  prepared: PushTokenAuthReplacePreparation,
): Promise<unknown> {
  return handlers.restore(prepared);
}

export async function withPushTokenReleaseAroundSessionReplace<T>(
  replaceSession: () => Promise<T>,
): Promise<T> {
  const prepared = await handlers.prepare();
  if (!mayReplaceFirebaseSession(prepared)) {
    try {
      await handlers.restore(prepared);
    } catch {
      // Stay on A; the unconfirmed error is what the caller surfaces.
    }
    throw new PushTokenReleaseUnconfirmedError();
  }
  try {
    return await replaceSession();
  } catch (err) {
    try {
      await handlers.restore(prepared);
    } catch {
      // Restore must not hide the sign-in failure.
    }
    throw err;
  }
}
