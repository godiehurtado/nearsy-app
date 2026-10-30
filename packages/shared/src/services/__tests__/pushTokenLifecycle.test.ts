/**
 * Device push-token session lifecycle — generation, this-device delete, races.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/services/__tests__/pushTokenLifecycle.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPushTokenSessionStore,
  registerDevicePushToken,
  unregisterDevicePushToken,
} from '../pushTokenLifecycle.ts';

type Write = { op: 'set' | 'delete'; uid: string; token: string };

function createHarness(initialUid: string | null) {
  let uid = initialUid;
  const writes: Write[] = [];
  const store = createPushTokenSessionStore();
  let mintDelay: Promise<void> | null = null;
  let persistDelay: Promise<void> | null = null;
  let persistStarted: Promise<void> = Promise.resolve();
  let signalPersistStarted: () => void = () => {};
  let minted = 'ExponentPushToken[device]';

  return {
    store,
    writes,
    get persistStarted() {
      return persistStarted;
    },
    setUid(next: string | null) {
      uid = next;
    },
    setMinted(token: string) {
      minted = token;
    },
    setMintDelay(delay: Promise<void> | null) {
      mintDelay = delay;
    },
    setPersistDelay(delay: Promise<void> | null) {
      persistDelay = delay;
      persistStarted = new Promise<void>((resolve) => {
        signalPersistStarted = resolve;
      });
    },
    register(permissionGranted = true) {
      return registerDevicePushToken({
        store,
        getUid: () => uid,
        permissionGranted,
        mintToken: async () => {
          if (mintDelay) await mintDelay;
          return minted;
        },
        persistToken: async (nextUid, token) => {
          signalPersistStarted();
          if (persistDelay) await persistDelay;
          writes.push({ op: 'set', uid: nextUid, token });
        },
        deleteToken: async (nextUid, token) => {
          writes.push({ op: 'delete', uid: nextUid, token });
        },
      });
    },
    unregister() {
      return unregisterDevicePushToken({
        store,
        getUid: () => uid,
        resolveToken: async () => minted,
        deleteToken: async (nextUid, token) => {
          writes.push({ op: 'delete', uid: nextUid, token });
        },
      });
    },
  };
}

describe('registerDevicePushToken', () => {
  it('requires a session and existing permission, then writes one doc', async () => {
    const h = createHarness(null);
    assert.deepEqual(await h.register(true), { ok: false, reason: 'no-user' });
    h.setUid('uid-a');
    assert.deepEqual(await h.register(false), {
      ok: false,
      reason: 'permission-not-granted',
    });
    assert.deepEqual(await h.register(true), {
      ok: true,
      token: 'ExponentPushToken[device]',
    });
    assert.deepEqual(h.writes, [
      { op: 'set', uid: 'uid-a', token: 'ExponentPushToken[device]' },
    ]);
    assert.deepEqual(h.store.bound, {
      uid: 'uid-a',
      token: 'ExponentPushToken[device]',
    });
  });

  it('aborts when logout bumps generation during mint', async () => {
    const h = createHarness('uid-a');
    let releaseMint: () => void = () => {};
    h.setMintDelay(
      new Promise<void>((resolve) => {
        releaseMint = resolve;
      }),
    );
    const pending = h.register(true);
    await h.unregister();
    releaseMint();
    assert.deepEqual(await pending, { ok: false, reason: 'stale-generation' });
    assert.equal(
      h.writes.some((w) => w.op === 'set'),
      false,
    );
  });

  it('aborts when the UID changes during mint', async () => {
    const h = createHarness('uid-a');
    let releaseMint: () => void = () => {};
    h.setMintDelay(
      new Promise<void>((resolve) => {
        releaseMint = resolve;
      }),
    );
    const pending = h.register(true);
    h.setUid('uid-b');
    releaseMint();
    assert.deepEqual(await pending, { ok: false, reason: 'user-changed' });
    assert.deepEqual(h.writes, []);
  });

  it('compensating-deletes the outgoing UID doc if persist loses the race', async () => {
    const h = createHarness('uid-a');
    let releasePersist: () => void = () => {};
    h.setPersistDelay(
      new Promise<void>((resolve) => {
        releasePersist = resolve;
      }),
    );
    const pending = h.register(true);
    await h.persistStarted;
    await h.unregister();
    releasePersist();
    assert.deepEqual(await pending, { ok: false, reason: 'stale-generation' });
    assert.deepEqual(h.writes, [
      { op: 'delete', uid: 'uid-a', token: 'ExponentPushToken[device]' },
      { op: 'set', uid: 'uid-a', token: 'ExponentPushToken[device]' },
      { op: 'delete', uid: 'uid-a', token: 'ExponentPushToken[device]' },
    ]);
    assert.equal(h.store.bound, null);
  });
});

describe('unregisterDevicePushToken', () => {
  it('deletes only this device token under the still-authenticated UID', async () => {
    const h = createHarness('uid-a');
    await h.register(true);
    h.writes.length = 0;
    await h.unregister();
    assert.deepEqual(h.writes, [
      { op: 'delete', uid: 'uid-a', token: 'ExponentPushToken[device]' },
    ]);
    assert.equal(h.store.bound, null);
  });

  it('does not delete after the outgoing session is already gone', async () => {
    const h = createHarness(null);
    await h.unregister();
    assert.deepEqual(h.writes, []);
  });

  it('account switch unregisters A then registers B with the same device token', async () => {
    const h = createHarness('uid-a');
    await h.register(true);
    await h.unregister();
    h.setUid('uid-b');
    assert.deepEqual(await h.register(true), {
      ok: true,
      token: 'ExponentPushToken[device]',
    });
    assert.deepEqual(h.writes, [
      { op: 'set', uid: 'uid-a', token: 'ExponentPushToken[device]' },
      { op: 'delete', uid: 'uid-a', token: 'ExponentPushToken[device]' },
      { op: 'set', uid: 'uid-b', token: 'ExponentPushToken[device]' },
    ]);
    assert.deepEqual(h.store.bound, {
      uid: 'uid-b',
      token: 'ExponentPushToken[device]',
    });
  });

  it('never enumerates or wipes other device tokens', async () => {
    const deletes: string[] = [];
    const store = createPushTokenSessionStore();
    store.bound = { uid: 'uid-a', token: 'ExponentPushToken[this]' };
    await unregisterDevicePushToken({
      store,
      getUid: () => 'uid-a',
      deleteToken: async (uid, token) => {
        deletes.push(`${uid}/${token}`);
      },
    });
    assert.deepEqual(deletes, ['uid-a/ExponentPushToken[this]']);
  });
});
