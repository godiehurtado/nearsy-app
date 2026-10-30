/**
 * This-device Expo push token lifecycle.
 * Does not rotate APNs keys, change entitlements, or prompt for permission.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mayRegisterAfterRelease,
  planPushTokenAuthSync,
  resolveThisDeviceTokenForRelease,
  shouldApplyPushTokenRegisterResult,
  thisDevicePushTokenDoc,
} from '../pushTokenLifecycle';
import { createPushTokenSession } from '../pushTokenSession';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relFromSrc: string): string {
  return readFileSync(join(here, '../..', relFromSrc), 'utf8');
}

function createFakeIo(opts?: {
  uid?: string | null;
  granted?: boolean;
  token?: string | null;
  failDelete?: boolean;
  failWrite?: boolean;
  getTokenDelayMs?: number;
}) {
  let uid = opts?.uid ?? 'user-a';
  const writes: Array<{ uid: string; token: string }> = [];
  const deletes: Array<{ uid: string; token: string }> = [];
  let getTokenCalls = 0;
  const io = {
    writes,
    deletes,
    get getTokenCalls() {
      return getTokenCalls;
    },
    setUid(next: string | null) {
      uid = next;
    },
    getCurrentUid: () => uid,
    getPermissionGranted: async () => opts?.granted !== false,
    getExpoPushToken: async () => {
      getTokenCalls += 1;
      if (opts?.getTokenDelayMs) {
        await new Promise((r) => setTimeout(r, opts.getTokenDelayMs));
      }
      return opts?.token === undefined ? 'ExponentPushToken[device]' : opts.token;
    },
    writeThisDeviceToken: async (targetUid: string, token: string) => {
      if (opts?.failWrite) throw new Error('write');
      writes.push({ uid: targetUid, token });
    },
    deleteThisDeviceToken: async (targetUid: string, token: string) => {
      if (opts?.failDelete) throw new Error('delete');
      deletes.push({ uid: targetUid, token });
    },
  };
  return io;
}

describe('push token lifecycle — decisions', () => {
  it('applies a register only for the live generation and uid', () => {
    assert.equal(
      shouldApplyPushTokenRegisterResult({
        requestGeneration: 2,
        currentGeneration: 2,
        requestUid: 'a',
        currentUid: 'a',
      }),
      true,
    );
    assert.equal(
      shouldApplyPushTokenRegisterResult({
        requestGeneration: 1,
        currentGeneration: 2,
        requestUid: 'a',
        currentUid: 'a',
      }),
      false,
    );
    assert.equal(
      shouldApplyPushTokenRegisterResult({
        requestGeneration: 2,
        currentGeneration: 2,
        requestUid: 'a',
        currentUid: 'b',
      }),
      false,
    );
    assert.equal(
      shouldApplyPushTokenRegisterResult({
        requestGeneration: 2,
        currentGeneration: 2,
        requestUid: 'a',
        currentUid: null,
      }),
      false,
    );
  });

  it('plans logout vs direct account switch vs first login', () => {
    assert.deepEqual(
      planPushTokenAuthSync({ previousUid: 'a', nextUid: null }),
      { action: 'none' },
    );
    assert.deepEqual(
      planPushTokenAuthSync({ previousUid: 'a', nextUid: 'b' }),
      { action: 'release-then-register', previousUid: 'a' },
    );
    assert.deepEqual(
      planPushTokenAuthSync({ previousUid: null, nextUid: 'b' }),
      { action: 'register' },
    );
    assert.deepEqual(
      planPushTokenAuthSync({ previousUid: 'a', nextUid: 'a' }),
      { action: 'register' },
    );
  });

  it('releases only the associated this-device token', () => {
    assert.deepEqual(
      resolveThisDeviceTokenForRelease({
        uid: 'a',
        association: { uid: 'a', token: 't-device' },
      }),
      { token: 't-device', source: 'association' },
    );
    assert.deepEqual(
      resolveThisDeviceTokenForRelease({
        uid: 'a',
        association: { uid: 'b', token: 't-other' },
      }),
      { token: null, source: 'unknown' },
    );
    assert.deepEqual(thisDevicePushTokenDoc('a', 't-device'), {
      userId: 'a',
      tokenId: 't-device',
    });
  });

  it('does not allow register after an unconfirmed release', () => {
    assert.equal(mayRegisterAfterRelease({ status: 'released', uid: 'a', token: 't' }), true);
    assert.equal(mayRegisterAfterRelease({ status: 'nothing-to-release' }), true);
    assert.equal(
      mayRegisterAfterRelease({ status: 'failed', reason: 'delete-failed', uid: 'a' }),
      false,
    );
  });
});

describe('push token session — register / release / switch', () => {
  it('registers under the current uid only when permission is granted', async () => {
    const denied = createFakeIo({ granted: false });
    const deniedSession = createPushTokenSession(denied);
    assert.deepEqual(await deniedSession.register(), {
      ok: false,
      reason: 'permission-not-granted',
    });
    assert.equal(denied.writes.length, 0);

    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    const result = await session.register();
    assert.deepEqual(result, { ok: true, token: 'ExponentPushToken[device]' });
    assert.deepEqual(io.writes, [
      { uid: 'user-a', token: 'ExponentPushToken[device]' },
    ]);
  });

  it('logout releases the previous uid token and does not delete siblings', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    const release = await session.releaseForCurrentUser();
    assert.equal(release.status, 'released');
    if (release.status === 'released') {
      assert.equal(release.uid, 'user-a');
      assert.equal(release.token, 'ExponentPushToken[device]');
    }
    assert.deepEqual(io.deletes, [
      { uid: 'user-a', token: 'ExponentPushToken[device]' },
    ]);
    assert.equal(io.deletes.length, 1);
  });

  it('direct account switch releases A then registers B with the same device token', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    io.setUid('user-b');
    const sync = await session.syncAuth('user-a', 'user-b');
    assert.deepEqual(sync, { ok: true, registered: true });
    assert.deepEqual(io.deletes, [
      { uid: 'user-a', token: 'ExponentPushToken[device]' },
    ]);
    assert.deepEqual(io.writes[1], {
      uid: 'user-b',
      token: 'ExponentPushToken[device]',
    });
    assert.equal(session.getAssociation()?.uid, 'user-b');
  });

  it('does not register B when release of A fails', async () => {
    const io = createFakeIo({ uid: 'user-a', failDelete: true });
    const session = createPushTokenSession(io);
    await session.register();
    io.setUid('user-b');
    const sync = await session.syncAuth('user-a', 'user-b');
    assert.deepEqual(sync, {
      ok: false,
      reason: 'release-unconfirmed',
      registered: false,
    });
    assert.equal(io.writes.length, 1);
    assert.equal(io.writes[0].uid, 'user-a');
  });

  it('discards a late register after logout generation bump', async () => {
    const io = createFakeIo({ uid: 'user-a', getTokenDelayMs: 20 });
    const session = createPushTokenSession(io);
    const pending = session.register();
    io.setUid(null);
    await session.syncAuth('user-a', null);
    const result = await pending;
    assert.deepEqual(result, { ok: false, reason: 'stale' });
    assert.equal(io.writes.length, 0);
  });

  it('does not reassociate a stale in-flight write to the previous uid', async () => {
    const io = createFakeIo({ uid: 'user-a', getTokenDelayMs: 20 });
    const session = createPushTokenSession(io);
    const pending = session.register();
    io.setUid('user-b');
    const sync = await session.syncAuth('user-a', 'user-b');
    const stale = await pending;
    assert.equal(stale.ok, false);
    assert.equal(stale.ok === false && stale.reason, 'stale');
    assert.equal(sync.ok, true);
    assert.deepEqual(
      io.writes.filter((w) => w.uid === 'user-a'),
      [],
    );
    assert.ok(io.writes.some((w) => w.uid === 'user-b'));
  });

  it('requires a session to register after a confirmed switch', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    io.setUid(null);
    const sync = await session.syncAuth('user-a', null);
    assert.deepEqual(sync, { ok: true, registered: false });
    assert.equal(io.writes.length, 1);
  });
});

describe('push token lifecycle — iOS auth wiring', () => {
  it('More logout releases this-device token before signOut', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const logout = more.slice(
      more.indexOf('const handleLogout'),
      more.indexOf('const openCalendar'),
    );
    const releaseIdx = logout.indexOf('releaseThisDevicePushTokenForCurrentUser');
    const signIdx = logout.indexOf('firebaseAuth.signOut');
    assert.ok(releaseIdx >= 0 && signIdx > releaseIdx);
  });

  it('App auth listener syncs tokens on uid change including LinkedIn', () => {
    const app = readShared('App.tsx');
    assert.match(app, /syncPushTokenForAuthUser\(previousUid, null\)/);
    assert.match(app, /syncPushTokenForAuthUser\(previousUid, user\.uid\)/);
    assert.match(app, /Google \/ Apple \/ Facebook \/ LinkedIn/);
    const linkedIn = readShared(
      'authentication/linkedinA3/authenticateWithLinkedIn.ts',
    );
    assert.doesNotMatch(linkedIn, /pushTokens|registerPushToken|syncPushToken/);
  });

  it('Delete Account releases this-device token before signOut', () => {
    const screen = readShared('screens/DeleteAccountScreen.tsx');
    const block = screen.slice(
      screen.indexOf('ensureSignedOut:'),
      screen.indexOf('navigation:'),
    );
    const releaseIdx = block.indexOf('releaseThisDevicePushTokenForCurrentUser');
    const signIdx = block.indexOf('firebaseAuth.signOut');
    assert.ok(releaseIdx >= 0 && signIdx > releaseIdx);
  });

  it('does not request OS notification permission and does not bulk-delete tokens', () => {
    const tokens = readShared('services/pushTokens.ts');
    const session = readShared('services/pushTokenSession.ts');
    assert.match(tokens, /getPermissionsAsync/);
    assert.doesNotMatch(tokens, /requestPermissionsAsync/);
    assert.match(tokens, /users', uid, 'pushTokens', token/);
    assert.doesNotMatch(session, /getDocs|collection\(/);
    assert.doesNotMatch(tokens, /getDocs/);
  });
});
