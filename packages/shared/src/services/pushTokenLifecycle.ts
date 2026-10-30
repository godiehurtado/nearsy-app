/**
 * Device push-token session lifecycle (Android).
 *
 * Pure helpers: Node tests never import RNFirebase / Expo.
 * One document path only: users/{uid}/pushTokens/{token}. Never wipes a
 * collection, so other devices of the same account stay registered.
 */

export type BoundPushToken = {
  uid: string;
  token: string;
};

export type PushTokenSessionStore = {
  generation: number;
  bound: BoundPushToken | null;
};

export type RegisterPushTokenReason =
  | 'no-user'
  | 'permission-not-granted'
  | 'no-token'
  | 'user-changed'
  | 'stale-generation'
  | 'exception';

export type RegisterPushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: RegisterPushTokenReason };

export function createPushTokenSessionStore(): PushTokenSessionStore {
  return { generation: 0, bound: null };
}

export function bumpPushTokenGeneration(
  store: PushTokenSessionStore,
): number {
  store.generation += 1;
  return store.generation;
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
  const uid = input.getUid();
  if (!uid) return { ok: false, reason: 'no-user' };
  if (!input.permissionGranted) {
    return { ok: false, reason: 'permission-not-granted' };
  }

  const generation = input.store.generation;

  const token = await input.mintToken();
  if (input.store.generation !== generation) {
    return { ok: false, reason: 'stale-generation' };
  }
  const stillUid = input.getUid();
  if (!stillUid || stillUid !== uid) {
    return { ok: false, reason: 'user-changed' };
  }
  if (!token) return { ok: false, reason: 'no-token' };

  await input.persistToken(uid, token);

  if (input.store.generation !== generation || input.getUid() !== uid) {
    await input.deleteToken(uid, token);
    return { ok: false, reason: 'stale-generation' };
  }

  input.store.bound = { uid, token };
  return { ok: true, token };
}

export type UnregisterDevicePushTokenInput = {
  store: PushTokenSessionStore;
  getUid: () => string | null;
  resolveToken?: () => Promise<string | null>;
  deleteToken: (uid: string, token: string) => Promise<void>;
};

/**
 * Drop this device's token under the still-authenticated UID, then invalidate
 * in-flight register work. Must run before Firebase signOut / account switch.
 */
export async function unregisterDevicePushToken(
  input: UnregisterDevicePushTokenInput,
): Promise<void> {
  const uid = input.getUid();
  const bound = input.store.bound;
  bumpPushTokenGeneration(input.store);
  input.store.bound = null;

  if (!uid) return;

  let token: string | null = null;
  if (bound && bound.uid === uid) {
    token = bound.token;
  } else if (input.resolveToken) {
    token = await input.resolveToken();
  }
  if (!token) return;

  await input.deleteToken(uid, token);
}
