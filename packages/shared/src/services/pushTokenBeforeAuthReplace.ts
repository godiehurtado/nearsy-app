/**
 * Last-moment this-device push-token release around a Firebase session replace.
 *
 * Firestore owner rules allow delete of users/{uid}/pushTokens/{token} only while
 * request.auth.uid === uid. After signInWithCredential / signInWithCustomToken
 * the listener may already observe B, so A cannot be deleted from there.
 *
 * Default handlers are no-ops so Node auth-adapter tests stay Firebase-free.
 * The live session binds real handlers from pushTokens.ts.
 */

export type PushTokenAuthReplacePreparation = {
  previousUid: string | null;
  released: boolean;
};

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
