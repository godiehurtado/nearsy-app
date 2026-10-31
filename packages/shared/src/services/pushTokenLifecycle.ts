/**
 * Device push-token session lifecycle (Android).
 *
 * Pure helpers: Node tests never import RNFirebase / Expo.
 * One document path only: users/{uid}/pushTokens/{token}. Never wipes a
 * collection, so other devices of the same account stay registered.
 *
 * Firestore `isOwner` (request.auth.uid == userId) is the only client
 * authorization. Compensating-delete / persist after the session left A
 * cannot be authorized. After Delete Account, client writes are sealed so
 * a late set cannot recreate documents the callable already removed.
 */

export type BoundPushToken = {
  uid: string;
  token: string;
};

export type PushTokenSessionStore = {
  generation: number;
  bound: BoundPushToken | null;
  writesAllowed: boolean;
  inFlight: Promise<unknown> | null;
};

export type RegisterPushTokenReason =
  | 'no-user'
  | 'permission-not-granted'
  | 'no-token'
  | 'user-changed'
  | 'stale-generation'
  | 'writes-sealed'
  | 'exception';

export type RegisterPushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: RegisterPushTokenReason };

export function createPushTokenSessionStore(): PushTokenSessionStore {
  return { generation: 0, bound: null, writesAllowed: true, inFlight: null };
}

export function bumpPushTokenGeneration(
  store: PushTokenSessionStore,
): number {
  store.generation += 1;
  return store.generation;
}

export function sealPushTokenWrites(store: PushTokenSessionStore): number {
  store.writesAllowed = false;
  store.bound = null;
  return bumpPushTokenGeneration(store);
}

export function unsealPushTokenWrites(store: PushTokenSessionStore): void {
  store.writesAllowed = true;
}

export async function awaitPushTokenInFlight(
  store: PushTokenSessionStore,
): Promise<void> {
  const pending = store.inFlight;
  if (pending) await pending.then(() => undefined, () => undefined);
}

function trackInFlight<T>(
  store: PushTokenSessionStore,
  work: Promise<T>,
): Promise<T> {
  const tracked: Promise<T> = work.finally(() => {
    if (store.inFlight === tracked) store.inFlight = null;
  });
  store.inFlight = tracked;
  return tracked;
}

function stillSameUid(
  getUid: () => string | null,
  uid: string,
): boolean {
  return getUid() === uid;
}

export type RegisterDevicePushTokenInput = {
  store: PushTokenSessionStore;
  getUid: () => string | null;
  permissionGranted: boolean;
  mintToken: () => Promise<string | null>;
  persistToken: (uid: string, token: string) => Promise<void>;
  deleteToken: (uid: string, token: string) => Promise<void>;
};

export async function registerDevicePushToken(
  input: RegisterDevicePushTokenInput,
): Promise<RegisterPushTokenResult> {
  if (!input.store.writesAllowed) {
    return { ok: false, reason: 'writes-sealed' };
  }
  const uid = input.getUid();
  if (!uid) return { ok: false, reason: 'no-user' };
  if (!input.permissionGranted) {
    return { ok: false, reason: 'permission-not-granted' };
  }

  const generation = input.store.generation;

  return trackInFlight(
    input.store,
    (async (): Promise<RegisterPushTokenResult> => {
      const token = await input.mintToken();
      if (!input.store.writesAllowed) {
        return { ok: false, reason: 'writes-sealed' };
      }
      if (input.store.generation !== generation) {
        return { ok: false, reason: 'stale-generation' };
      }
      if (!stillSameUid(input.getUid, uid)) {
        return { ok: false, reason: 'user-changed' };
      }
      if (!token) return { ok: false, reason: 'no-token' };

      await input.persistToken(uid, token);

      if (!input.store.writesAllowed) {
        return { ok: false, reason: 'writes-sealed' };
      }
      if (
        input.store.generation !== generation ||
        !stillSameUid(input.getUid, uid)
      ) {
        // Compensating-delete is only authorized while Auth is still A.
        if (stillSameUid(input.getUid, uid) && input.store.writesAllowed) {
          await input.deleteToken(uid, token);
        }
        return { ok: false, reason: 'stale-generation' };
      }

      input.store.bound = { uid, token };
      return { ok: true, token };
    })(),
  );
}

export type UnregisterDevicePushTokenInput = {
  store: PushTokenSessionStore;
  getUid: () => string | null;
  resolveToken?: () => Promise<string | null>;
  deleteToken: (uid: string, token: string) => Promise<void>;
};

/**
 * Drop this device's token under the still-authenticated UID, then wait for
 * in-flight register work so any compensating-delete still runs as that UID.
 * Must run before Firebase signOut / account switch.
 */
export async function unregisterDevicePushToken(
  input: UnregisterDevicePushTokenInput,
): Promise<void> {
  const uid = input.getUid();
  const bound = input.store.bound;
  bumpPushTokenGeneration(input.store);
  input.store.bound = null;

  if (uid && input.store.writesAllowed) {
    let token: string | null = null;
    if (bound && bound.uid === uid) {
      token = bound.token;
    } else if (input.resolveToken) {
      token = await input.resolveToken();
    }
    if (token) {
      await input.deleteToken(uid, token);
    }
  }

  await awaitPushTokenInFlight(input.store);
}

/**
 * Delete Account: abort in-flight register and forbid further client
 * persist/delete so a late set cannot recreate documents after the callable.
 */
export async function sealDevicePushTokenSession(
  store: PushTokenSessionStore,
): Promise<void> {
  sealPushTokenWrites(store);
  await awaitPushTokenInFlight(store);
}

/**
 * Failed / cancelled account replacement: if Auth is still the outgoing UID,
 * restore this device's registration. No-op when the session already moved.
 */
export async function restoreDevicePushTokenIfSession<T>(input: {
  store: PushTokenSessionStore;
  expectedUid: string | null;
  getUid: () => string | null;
  restore: () => Promise<T>;
}): Promise<T | null> {
  if (!input.expectedUid) return null;
  if (input.getUid() !== input.expectedUid) return null;
  unsealPushTokenWrites(input.store);
  return input.restore();
}

export async function runWithOutgoingPushRelease<T>(input: {
  getUid: () => string | null;
  release: () => Promise<void>;
  restore: () => Promise<unknown>;
  operation: () => Promise<T>;
}): Promise<T> {
  const uid = input.getUid();
  try {
    await input.release();
    return await input.operation();
  } catch (err) {
    if (uid && input.getUid() === uid) {
      await input.restore().then(() => undefined, () => undefined);
    }
    throw err;
  }
}
