/**
 * This-device Expo push token lifecycle.
 * Does not rotate APNs keys, change entitlements, or prompt for permission.
 */
import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  authenticatedIdentityCanMutatePushTokenDoc,
  mayRegisterAfterRelease,
  mayRegisterThisDeviceUnderUid,
  planPushTokenAuthSync,
  resolveThisDeviceTokenForRelease,
  shouldApplyPushTokenRegisterResult,
  thisDevicePushTokenDoc,
} from '../pushTokenLifecycle';
import { createPushTokenSession } from '../pushTokenSession';
import {
  bindPushTokenAuthReplaceHandlers,
  resetPushTokenAuthReplaceHandlersForTests,
  withPushTokenReleaseAroundSessionReplace,
} from '../pushTokenBeforeAuthReplace';

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
  registrationAllowed?: boolean;
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
    isRegistrationAllowed: (nextUid: string) => {
      if (opts?.registrationAllowed === false) return false;
      void nextUid;
      return true;
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

  it('Firestore owner rule: only the authenticated uid can mutate its pushTokens doc', () => {
    assert.equal(authenticatedIdentityCanMutatePushTokenDoc('a', 'a'), true);
    assert.equal(authenticatedIdentityCanMutatePushTokenDoc('b', 'a'), false);
    assert.equal(authenticatedIdentityCanMutatePushTokenDoc(null, 'a'), false);
  });

  it('plans logout vs live-uid register; listener never deletes the previous uid', () => {
    assert.deepEqual(
      planPushTokenAuthSync({ previousUid: 'a', nextUid: null }),
      { action: 'none' },
    );
    assert.deepEqual(
      planPushTokenAuthSync({ previousUid: 'a', nextUid: 'b' }),
      { action: 'register' },
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

  it('does not allow register after an unconfirmed release or under a foreign association', () => {
    assert.equal(mayRegisterAfterRelease({ status: 'released', uid: 'a', token: 't' }), true);
    assert.equal(mayRegisterAfterRelease({ status: 'nothing-to-release' }), true);
    assert.equal(
      mayRegisterAfterRelease({ status: 'failed', reason: 'delete-failed', uid: 'a' }),
      false,
    );
    assert.equal(
      mayRegisterThisDeviceUnderUid({
        nextUid: 'b',
        association: { uid: 'a', token: 't' },
        registrationAllowed: true,
      }),
      false,
    );
    assert.equal(
      mayRegisterThisDeviceUnderUid({
        nextUid: 'b',
        association: null,
        registrationAllowed: false,
      }),
      false,
    );
    assert.equal(
      mayRegisterThisDeviceUnderUid({
        nextUid: 'b',
        association: null,
        registrationAllowed: true,
      }),
      true,
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

  it('direct A→B deletes A while still A; listener as B only registers B', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    const prepared = await session.prepareForIncomingAuth();
    assert.equal(prepared.previousUid, 'user-a');
    assert.equal(prepared.released, true);
    assert.deepEqual(io.deletes, [
      { uid: 'user-a', token: 'ExponentPushToken[device]' },
    ]);
    io.setUid('user-b');
    const sync = await session.syncAuth('user-a', 'user-b');
    assert.deepEqual(sync, { ok: true, registered: true });
    assert.equal(io.deletes.length, 1);
    assert.deepEqual(io.writes[1], {
      uid: 'user-b',
      token: 'ExponentPushToken[device]',
    });
    assert.equal(session.getAssociation()?.uid, 'user-b');
  });

  it('listener observing B cannot delete A and does not claim a switch if A is still associated', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    io.setUid('user-b');
    const sync = await session.syncAuth('user-a', 'user-b');
    assert.deepEqual(sync, {
      ok: false,
      reason: 'previous-release-unconfirmed',
      registered: false,
    });
    assert.equal(io.deletes.length, 0);
    assert.equal(
      io.writes.filter((w) => w.uid === 'user-b').length,
      0,
    );
    const refused = await session.releaseForUid('user-a');
    assert.deepEqual(refused, {
      status: 'failed',
      reason: 'identity-mismatch',
      uid: 'user-a',
    });
    assert.equal(io.deletes.length, 0);
  });

  it('does not register B when release of A fails', async () => {
    const io = createFakeIo({ uid: 'user-a', failDelete: true });
    const session = createPushTokenSession(io);
    await session.register();
    const prepared = await session.prepareForIncomingAuth();
    assert.equal(prepared.released, false);
    io.setUid('user-b');
    const sync = await session.syncAuth('user-a', 'user-b');
    assert.deepEqual(sync, {
      ok: false,
      reason: 'previous-release-unconfirmed',
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
    const prepared = await session.prepareForIncomingAuth();
    assert.equal(prepared.released, true);
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

  it('restores A when the incoming login fails and A is still authenticated', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    const prepared = await session.prepareForIncomingAuth();
    assert.equal(prepared.released, true);
    assert.equal(session.getAssociation(), null);
    assert.equal(io.getCurrentUid(), 'user-a');
    const restored = await session.restoreAfterAbortedAuth(prepared);
    assert.equal(restored.ok, true);
    assert.equal(session.getAssociation()?.uid, 'user-a');
    assert.ok(io.writes.filter((w) => w.uid === 'user-a').length >= 2);
  });

  it('does not restore A after a failed login if the live uid is already B', async () => {
    const io = createFakeIo({ uid: 'user-a' });
    const session = createPushTokenSession(io);
    await session.register();
    const prepared = await session.prepareForIncomingAuth();
    io.setUid('user-b');
    const restored = await session.restoreAfterAbortedAuth(prepared);
    assert.deepEqual(restored, { ok: true, registered: false });
    assert.equal(
      io.writes.filter((w) => w.uid === 'user-a').length,
      1,
    );
  });

  it('does not recreate a token after account deletion suppresses registration', async () => {
    const io = createFakeIo({ uid: 'user-a', registrationAllowed: false });
    const session = createPushTokenSession(io);
    assert.deepEqual(await session.register(), {
      ok: false,
      reason: 'registration-suppressed',
    });
    assert.equal(io.writes.length, 0);
    const sync = await session.syncAuth(null, 'user-a');
    assert.deepEqual(sync, {
      ok: false,
      reason: 'registration-suppressed',
      registered: false,
    });
    assert.equal(io.writes.length, 0);
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

describe('push token lifecycle — session replace wrap', () => {
  afterEach(() => {
    resetPushTokenAuthReplaceHandlersForTests();
  });

  it('releases before replace and restores when replace throws', async () => {
    const events: string[] = [];
    bindPushTokenAuthReplaceHandlers({
      prepare: async () => {
        events.push('prepare');
        return { previousUid: 'user-a', released: true };
      },
      restore: async (prepared) => {
        events.push(`restore:${prepared.previousUid}`);
      },
    });
    await assert.rejects(
      () =>
        withPushTokenReleaseAroundSessionReplace(async () => {
          events.push('replace');
          throw new Error('sign-in-failed');
        }),
      /sign-in-failed/,
    );
    assert.deepEqual(events, ['prepare', 'replace', 'restore:user-a']);
  });

  it('does not restore after a successful replace', async () => {
    const events: string[] = [];
    bindPushTokenAuthReplaceHandlers({
      prepare: async () => {
        events.push('prepare');
        return { previousUid: 'user-a', released: true };
      },
      restore: async () => {
        events.push('restore');
      },
    });
    const value = await withPushTokenReleaseAroundSessionReplace(async () => {
      events.push('replace');
      return 'ok';
    });
    assert.equal(value, 'ok');
    assert.deepEqual(events, ['prepare', 'replace']);
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

  it('session-replacing sign-ins release before Firebase replace, including LinkedIn', () => {
    const email = readShared('services/authService.ios.ts');
    const login = email.slice(email.indexOf('export const loginWithEmail'));
    assert.match(login, /withPushTokenReleaseAroundSessionReplace/);
    assert.match(login, /signInWithEmailAndPassword/);
    assert.ok(
      login.indexOf('withPushTokenReleaseAroundSessionReplace') <
        login.indexOf('signInWithEmailAndPassword'),
    );

    const social = readShared(
      'authentication/social/infrastructure/firebase/firebaseJsAuthenticationAdapter.ios.ts',
    );
    assert.match(social, /signInReplacingFirebaseSession/);
    assert.match(social, /withPushTokenReleaseAroundSessionReplace/);
    assert.match(social, /signInWithCredential/);

    const linkedIn = readShared(
      'authentication/linkedinA3/authenticateWithLinkedIn.ts',
    );
    assert.match(linkedIn, /withPushTokenReleaseAroundSessionReplace/);
    assert.match(linkedIn, /signInWithCustomToken\(firebaseAuth, customToken\)/);
    const wrapIdx = linkedIn.indexOf('withPushTokenReleaseAroundSessionReplace');
    const customIdx = linkedIn.indexOf(
      'signInWithCustomToken(firebaseAuth, customToken)',
    );
    assert.ok(wrapIdx >= 0 && customIdx > wrapIdx);
  });

  it('App auth listener syncs tokens on uid change without deleting A after B is live', () => {
    const app = readShared('App.tsx');
    assert.match(app, /syncPushTokenForAuthUser\(previousUid, null\)/);
    assert.match(app, /syncPushTokenForAuthUser\(previousUid, user\.uid\)/);
    assert.match(app, /Firestore owner rules forbid/);
    assert.match(app, /LinkedIn custom/);
  });

  it('Delete Account releases this-device token before signOut and does not recreate after closure', () => {
    const screen = readShared('screens/DeleteAccountScreen.tsx');
    const block = screen.slice(
      screen.indexOf('ensureSignedOut:'),
      screen.indexOf('navigation:'),
    );
    const releaseIdx = block.indexOf('releaseThisDevicePushTokenForCurrentUser');
    const signIdx = block.indexOf('firebaseAuth.signOut');
    assert.ok(releaseIdx >= 0 && signIdx > releaseIdx);

    const tokens = readShared('services/pushTokens.ts');
    assert.match(tokens, /isAccountDeletionSessionActive/);
    assert.match(tokens, /isAccountClosedByDeletion/);
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
