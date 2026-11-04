/**
 * Behaviour tests for the iOS 2.0.9 beta hardening (Contacts states and
 * concurrency, UID-scoped SecureStore session, Home filter rollback ledger,
 * Alignment ring half-clip layout). No network, no native modules.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALIGNMENT_RING_COMPACT_SIZE,
  ALIGNMENT_RING_DETAIL_SIZE,
  ALIGNMENT_RING_HALF_CLIP_BLEED,
  computeAlignmentHalfClipLayout,
} from '../components/alignment/alignmentRingGeometry';
import {
  CONTACTS_OP_SKIPPED_REASON,
  classifyContactsOutcome,
  createContactsOperationRunner,
  driveContactsOperation,
  type ContactsOutcomeView,
} from '../contacts/contactsOperationCoordinator';
import {
  disableContactsSyncFlow,
  enableAndSyncContacts,
  type ContactsControllerOutcome,
  type ContactsControllerPorts,
} from '../contacts/controller';
import { ContactsHmacClientError } from '../contacts/errors';
import {
  createFakeContactsHmacClient,
  createMemoryContactsSessionStore,
} from '../contacts/fakeClient';
import {
  LEGACY_CONTACTS_SESSION_KEYS,
  contactsSessionKeysForUid,
  createSecureStoreContactsSessionStore,
  type ExpoSecureStoreLike,
} from '../contacts/iosContactsSession.ios';
import { parseContactsWireResult } from '../contacts/parse';
import type { ContactsAddressBookPort } from '../contacts/port';
import type { ContactsWireResult } from '../contacts/wireTypes';
import { createSearchPreferencesWriteLedger } from '../visibility/searchPreferencesWriteLedger';
import type {
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from '../visibility/types';

// ---------- helpers ----------

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function wire(overrides: Partial<ContactsWireResult>): ContactsWireResult {
  return parseContactsWireResult({
    result: 'synced',
    contactsSyncEnabled: true,
    contactsEpoch: 1,
    notifyNearbyContactsEffective: true,
    syncCommitted: true,
    reevaluateRequired: false,
    ...overrides,
  });
}

function grantedBook(): ContactsAddressBookPort {
  return {
    getPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    readRows: async () => [{ phoneNumbers: [{ number: '+15555550100' }] }],
  };
}

function ports(
  overrides: Partial<ContactsControllerPorts> = {},
): ContactsControllerPorts {
  return {
    client: createFakeContactsHmacClient(),
    session: createMemoryContactsSessionStore(),
    book: grantedBook(),
    createRandomHex: () => 'abcdef0123456789',
    ...overrides,
  };
}

function fakeSecureStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const reads: string[] = [];
  const store: ExpoSecureStoreLike & { failReads: boolean } = {
    failReads: false,
    async getItemAsync(key) {
      if (store.failReads) throw new Error('keychain locked');
      reads.push(key);
      return data.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      assert.match(key, /^[A-Za-z0-9._-]+$/, `invalid SecureStore key ${key}`);
      data.set(key, value);
    },
    async deleteItemAsync(key) {
      data.delete(key);
    },
  };
  return { store, data, reads };
}

// ---------- 1. Contacts confirmed states ----------

describe('Contacts outcome classification', () => {
  it('reports synced only when bookSynced AND syncCommitted', () => {
    const synced = classifyContactsOutcome(
      'enable',
      { ok: true, bookSynced: true, result: wire({ syncCommitted: true }) },
      false,
    );
    assert.equal(synced.view, 'synced');
    assert.equal(synced.enabled, true);

    const notCommitted = classifyContactsOutcome(
      'sync',
      {
        ok: true,
        bookSynced: false,
        result: wire({ result: 'pending', syncCommitted: false }),
      },
      true,
    );
    assert.equal(notCommitted.view, 'enabledNotSynced');
    assert.notEqual(notCommitted.view, 'synced');
  });

  it('confirmed enable + failed sync keeps ON and offers retry (not synced)', () => {
    const view = classifyContactsOutcome(
      'enable',
      {
        ok: false,
        reason: 'contacts-rate-limited',
        bookSynced: false,
        identityEnabled: true,
        result: wire({ result: 'enabled' }),
      },
      false,
    );
    assert.deepEqual(
      [view.enabled, view.view, view.retryable],
      [true, 'error', true],
    );
  });

  it('transport failure on disable/enable is uncertain (null), not a rollback', () => {
    for (const kind of ['enable', 'disable'] as const) {
      const view = classifyContactsOutcome(
        kind,
        { ok: false, reason: 'contacts-hmac-unavailable', bookSynced: false },
        kind === 'disable',
      );
      assert.equal(view.enabled, null, kind);
    }
  });

  it('a definite Identity rejection keeps the previous confirmed state', () => {
    const view = classifyContactsOutcome(
      'disable',
      { ok: false, reason: 'contacts-epoch-mismatch', bookSynced: false },
      true,
    );
    assert.equal(view.enabled, true);
  });

  it('caps are not retryable', () => {
    const view = classifyContactsOutcome(
      'sync',
      { ok: false, reason: 'contacts-identifier-cap', bookSynced: false },
      true,
    );
    assert.equal(view.retryable, false);
  });

  it('reevaluate failure does not turn a committed sync into a failure', async () => {
    const outcome = await enableAndSyncContacts(
      ports({
        client: createFakeContactsHmacClient(),
        afterIdentity: async () => {
          throw new Error('reevaluate down');
        },
      }),
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.bookSynced, true);
    assert.equal(classifyContactsOutcome('enable', outcome, false).view, 'synced');
  });

  it('enable callable throwing returns a reason instead of rejecting', async () => {
    const outcome = await enableAndSyncContacts(
      ports({
        client: createFakeContactsHmacClient({
          enableContactsSync: async () => {
            throw new ContactsHmacClientError('contacts-account-gone', 'gone');
          },
        }),
      }),
    );
    assert.deepEqual(outcome, {
      ok: false,
      reason: 'contacts-account-gone',
      bookSynced: false,
    });
  });
});

// ---------- 2. Timeout and concurrency ----------

describe('Contacts operation runner', () => {
  it('a retry while enable is running joins it (no parallel sync)', async () => {
    const runner = createContactsOperationRunner();
    const gate = deferred<ContactsControllerOutcome>();
    let calls = 0;
    const task = () => {
      calls += 1;
      return gate.promise;
    };
    const first = runner.run('uid-a', 'enable', task);
    const retry = runner.run('uid-a', 'sync', task);
    const again = runner.run('uid-a', 'sync', task);
    assert.equal(retry.joined, true);
    assert.equal(again.joined, true);
    assert.equal(retry.promise, first.promise);
    await tick();
    assert.equal(calls, 1);
    gate.resolve({ ok: true, bookSynced: true, result: wire({}) });
    await first.promise;
    assert.equal(runner.inFlight('uid-a'), null);
  });

  it('different UIDs never share or block operations', async () => {
    const runner = createContactsOperationRunner();
    const gate = deferred<ContactsControllerOutcome>();
    runner.run('uid-a', 'sync', () => gate.promise);
    let bRan = false;
    const b = runner.run('uid-b', 'sync', async () => {
      bRan = true;
      return { ok: true, bookSynced: true, result: wire({}) };
    });
    assert.equal(b.joined, false);
    await b.promise;
    assert.equal(bRan, true);
    gate.resolve({ ok: true, bookSynced: true, result: wire({}) });
  });

  it('disable starts without waiting for the running sync and supersedes it', async () => {
    const runner = createContactsOperationRunner();
    const order: string[] = [];
    const gate = deferred<ContactsControllerOutcome>();
    const sync = runner.run('uid-a', 'sync', async () => {
      order.push('sync:start');
      const out = await gate.promise;
      order.push('sync:end');
      return out;
    });
    const disable = runner.run('uid-a', 'disable', async () => {
      order.push('disable');
      return { ok: true, bookSynced: false, result: wire({ contactsSyncEnabled: false }) };
    });
    assert.equal(disable.joined, false);
    await tick();
    gate.resolve({ ok: true, bookSynced: true, result: wire({}) });
    await disable.promise;
    await sync.promise;
    assert.deepEqual(order, ['sync:start', 'disable', 'sync:end']);
    assert.equal(runner.isCurrent(sync.token), false, 'sync result is stale');
    assert.equal(runner.isCurrent(disable.token), true);
  });

  it('logout invalidation skips queued work that has not started', async () => {
    const runner = createContactsOperationRunner();
    const gate = deferred<ContactsControllerOutcome>();
    runner.run('uid-a', 'refresh', () => gate.promise);
    let enableRan = false;
    const enable = runner.run('uid-a', 'enable', async () => {
      enableRan = true;
      return { ok: true, bookSynced: true, result: wire({}) };
    });
    runner.invalidate('uid-a');
    gate.resolve({ ok: true, bookSynced: false, result: wire({}) });
    const out = await enable.promise;
    assert.equal(enableRan, false, 'consent never re-sent after logout');
    assert.equal(out.ok === false && out.reason, CONTACTS_OP_SKIPPED_REASON);
  });

  it('UI timeout shows confirming, keeps listening, applies the late real result', async () => {
    const runner = createContactsOperationRunner();
    const gate = deferred<ContactsControllerOutcome>();
    const views: ContactsOutcomeView[] = [];
    let taskCalls = 0;
    const done = driveContactsOperation({
      runner,
      uid: 'uid-a',
      kind: 'enable',
      previousEnabled: false,
      waitMs: 5,
      task: () => {
        taskCalls += 1;
        return gate.promise;
      },
      isActive: () => true,
      readServerState: async () => {
        throw new Error('should not read: outcome is conclusive');
      },
      onView: (v) => views.push(v),
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(
      views.map((v) => v.view),
      ['syncing', 'confirming'],
    );
    assert.equal(views[1].enabled, null, 'no ON/OFF claim while uncertain');
    gate.resolve({ ok: true, bookSynced: true, result: wire({}) });
    await done;
    assert.equal(views.at(-1)?.view, 'synced');
    assert.equal(views.at(-1)?.enabled, true);
    assert.equal(taskCalls, 1);
  });

  it('late result after logout is dropped', async () => {
    const runner = createContactsOperationRunner();
    const gate = deferred<ContactsControllerOutcome>();
    const views: string[] = [];
    const done = driveContactsOperation({
      runner,
      uid: 'uid-a',
      kind: 'sync',
      previousEnabled: true,
      waitMs: 5,
      task: () => gate.promise,
      isActive: () => true,
      readServerState: async () => null,
      onView: (v) => views.push(v.view),
    });
    await new Promise((r) => setTimeout(r, 20));
    runner.invalidate('uid-a');
    gate.resolve({ ok: true, bookSynced: true, result: wire({}) });
    await done;
    assert.deepEqual(views, ['syncing', 'confirming']);
  });

  it('uncertain disable reads off from the server: done, not an error', async () => {
    const runner = createContactsOperationRunner();
    const views: ContactsOutcomeView[] = [];
    await driveContactsOperation({
      runner,
      uid: 'uid-a',
      kind: 'disable',
      previousEnabled: true,
      waitMs: 1000,
      task: async () => ({
        ok: false,
        reason: 'contacts-hmac-unavailable',
        bookSynced: false,
      }),
      isActive: () => true,
      readServerState: async () => ({ enabled: false, notifyNearbyContacts: false }),
      onView: (v) => views.push(v),
    });
    const last = views.at(-1)!;
    assert.equal(last.view, 'idle');
    assert.equal(last.enabled, false, 'server said OFF — the disable landed');
  });

  it('unreadable server state stays explicitly unknown', async () => {
    const runner = createContactsOperationRunner();
    const views: ContactsOutcomeView[] = [];
    await driveContactsOperation({
      runner,
      uid: 'uid-a',
      kind: 'disable',
      previousEnabled: true,
      waitMs: 1000,
      task: async () => {
        throw new Error('boom');
      },
      isActive: () => true,
      readServerState: async () => {
        throw new Error('offline');
      },
      onView: (v) => views.push(v),
    });
    assert.equal(views.at(-1)?.enabled, null);
  });

  it('disable after enable uses the epoch the enable persisted', async () => {
    const session = createMemoryContactsSessionStore({ contactsEpoch: 0 });
    const client = createFakeContactsHmacClient({
      enableContactsSync: async () => wire({ result: 'enabled', contactsEpoch: 7 }),
      syncContactHashes: async (req) =>
        wire({
          contactsEpoch: req.contactsEpoch,
          sourceId: req.sourceId,
          snapshotVersion: req.snapshotVersion,
        }),
    });
    const runner = createContactsOperationRunner();
    const p = ports({ client, session });
    await runner.run('uid-a', 'enable', () => enableAndSyncContacts(p)).promise;
    await runner.run('uid-a', 'disable', () => disableContactsSyncFlow(p)).promise;
    const disableCall = client.calls.find((c) => c.name === 'disableContactsSync');
    assert.deepEqual(disableCall?.request, { contactsEpoch: 7 });
  });
});

// ---------- 3. SecureStore session (real .ios.ts adapter) ----------

describe('iOS SecureStore Contacts session', () => {
  const legacySeed = {
    [LEGACY_CONTACTS_SESSION_KEYS[0]]: 'ios_legacysource01',
    [LEGACY_CONTACTS_SESSION_KEYS[1]]: '9',
    [LEGACY_CONTACTS_SESSION_KEYS[2]]: '4',
    [LEGACY_CONTACTS_SESSION_KEYS[3]]: 'fp-legacy',
  };

  it('never assigns legacy global identity to the first UID, and leaves it untouched', async () => {
    const { store, data, reads } = fakeSecureStore(legacySeed);
    const session = createSecureStoreContactsSessionStore('uid-a', async () => store);
    assert.equal(await session.load(), null);
    for (const key of LEGACY_CONTACTS_SESSION_KEYS) {
      assert.equal(reads.includes(key), false, `read ${key}`);
      assert.equal(data.get(key), legacySeed[key], `kept ${key}`);
    }

    // First sync mints a fresh source for this UID.
    const client = createFakeContactsHmacClient();
    const out = await enableAndSyncContacts(ports({ client, session }));
    assert.equal(out.ok, true);
    const sync = client.calls.find((c) => c.name === 'syncContactHashes')!
      .request as { sourceId: string; snapshotVersion: number };
    assert.notEqual(sync.sourceId, 'ios_legacysource01');
    assert.equal(sync.snapshotVersion, 1);
    assert.equal(data.get(LEGACY_CONTACTS_SESSION_KEYS[0]), 'ios_legacysource01');
  });

  it('isolates two UIDs on the same device', async () => {
    const { store } = fakeSecureStore();
    const a = createSecureStoreContactsSessionStore('uid-a', async () => store);
    const b = createSecureStoreContactsSessionStore('uid-b', async () => store);
    await a.save({ sourceId: 'src_a_000001', contactsEpoch: 3, snapshotVersion: 2, fingerprint: 'fa' });
    assert.equal(await b.load(), null);
    await b.save({ sourceId: 'src_b_000001', contactsEpoch: 1, snapshotVersion: 1, fingerprint: 'fb' });
    assert.equal((await a.load())?.sourceId, 'src_a_000001');
    assert.equal((await b.load())?.contactsEpoch, 1);
  });

  it('keeps snapshotVersion monotonic for the same sourceId', async () => {
    const { store } = fakeSecureStore();
    const s = createSecureStoreContactsSessionStore('uid-a', async () => store);
    await s.save({ sourceId: 'src_a_000001', contactsEpoch: 1, snapshotVersion: 5, fingerprint: 'f5' });
    await s.save({ sourceId: 'src_a_000001', contactsEpoch: 1, snapshotVersion: 3, fingerprint: 'f3' });
    assert.equal((await s.load())?.snapshotVersion, 5);
    await s.save({ sourceId: 'src_a_000001', contactsEpoch: 2, snapshotVersion: null, fingerprint: null });
    assert.equal((await s.load())?.snapshotVersion, 5);
    await s.clearFingerprint();
    const after = await s.load();
    assert.equal(after?.snapshotVersion, 5);
    assert.equal(after?.fingerprint, null);
    await s.save({ sourceId: 'src_a_000001', contactsEpoch: 2, snapshotVersion: 6, fingerprint: 'f6' });
    assert.equal((await s.load())?.snapshotVersion, 6);
  });

  it('an unreadable keychain throws instead of minting a new sourceId', async () => {
    const { store } = fakeSecureStore();
    const s = createSecureStoreContactsSessionStore('uid-a', async () => store);
    await s.save({ sourceId: 'src_a_000001', contactsEpoch: 1, snapshotVersion: 1, fingerprint: 'f' });
    store.failReads = true;
    await assert.rejects(s.load(), /contacts-session-unavailable/);
  });

  it('escapes UID characters SecureStore rejects', async () => {
    const keys = contactsSessionKeysForUid('weird uid/with:chars');
    for (const key of Object.values(keys)) {
      assert.match(key, /^[A-Za-z0-9._-]+$/);
    }
    assert.notEqual(
      contactsSessionKeysForUid('a/b').sourceId,
      contactsSessionKeysForUid('a_b').sourceId,
    );
  });
});

// ---------- 4. Home filters ledger ----------

function prefs(maxDistanceMeters: number): VisibilitySearchPreferences {
  return { ageMin: 18, ageMax: 99, maxDistanceMeters, interestIds: [] };
}
function byMode(personal: number, professional: number): VisibilitySearchPreferencesByMode {
  return { personal: prefs(personal), professional: prefs(professional) };
}

describe('Home filters write ledger', () => {
  it('latest failure restores the last CONFIRMED value, not an older pending one', () => {
    const l = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const a = l.begin('personal', prefs(30));
    const b = l.begin('personal', prefs(40));
    assert.equal(l.display().personal.maxDistanceMeters, 40);
    const failB = l.fail(b)!;
    assert.equal(failB.latestForModeFailed, true);
    assert.equal(failB.display.personal.maxDistanceMeters, 10);
    // A lands later: it is now the confirmed server value and is shown.
    const okA = l.succeed(a)!;
    assert.equal(okA.display.personal.maxDistanceMeters, 30);
    assert.equal(okA.idle, true);
  });

  it('out-of-order: older failure after newer success changes nothing, no alert', () => {
    const l = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const a = l.begin('personal', prefs(30));
    const b = l.begin('personal', prefs(40));
    l.succeed(b);
    const failA = l.fail(a)!;
    assert.equal(failA.latestForModeFailed, false);
    assert.equal(failA.display.personal.maxDistanceMeters, 40);
    assert.equal(l.confirmed().personal.maxDistanceMeters, 40);
  });

  it('older success arriving after newer success never regresses confirmed', () => {
    const l = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const a = l.begin('personal', prefs(30));
    const b = l.begin('personal', prefs(40));
    l.succeed(b);
    l.succeed(a);
    assert.equal(l.confirmed().personal.maxDistanceMeters, 40);
  });

  it('older failure while a newer edit is pending keeps showing the newer edit', () => {
    const l = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const a = l.begin('personal', prefs(30));
    l.begin('personal', prefs(40));
    const failA = l.fail(a)!;
    assert.equal(failA.latestForModeFailed, false);
    assert.equal(failA.display.personal.maxDistanceMeters, 40);
  });

  it('modes are isolated', () => {
    const l = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const p = l.begin('personal', prefs(30));
    const q = l.begin('professional', prefs(50));
    const failQ = l.fail(q)!;
    assert.equal(failQ.latestForModeFailed, true);
    assert.equal(failQ.display.professional.maxDistanceMeters, 20);
    assert.equal(failQ.display.personal.maxDistanceMeters, 30, 'personal edit still pending');
    l.succeed(p);
    assert.deepEqual(
      [l.display().personal.maxDistanceMeters, l.display().professional.maxDistanceMeters],
      [30, 20],
    );
  });

  it('server hydration is ignored while writes are pending', () => {
    const l = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const a = l.begin('personal', prefs(30));
    l.hydrate(byMode(99, 99));
    assert.equal(l.fail(a)!.display.personal.maxDistanceMeters, 10);
    l.hydrate(byMode(15, 25));
    assert.equal(l.display().personal.maxDistanceMeters, 15);
  });

  it('ledgers are per UID', () => {
    const a = createSearchPreferencesWriteLedger('uid-a', byMode(10, 20));
    const b = createSearchPreferencesWriteLedger('uid-b', byMode(11, 21));
    const e = a.begin('personal', prefs(30));
    assert.equal(b.fail(e), null, 'foreign epoch is not settled by another ledger');
    assert.equal(b.display().personal.maxDistanceMeters, 11);
  });
});

// ---------- 6. Alignment ring half-clip layout ----------

describe('Alignment ring half-clip layout', () => {
  for (const size of [ALIGNMENT_RING_COMPACT_SIZE, ALIGNMENT_RING_DETAIL_SIZE, 37]) {
    it(`keeps arcs on the ring square and clips off the center seam (size ${size})`, () => {
      const bleed = ALIGNMENT_RING_HALF_CLIP_BLEED;
      const half = size / 2;
      const { first, second } = computeAlignmentHalfClipLayout(size);

      // Semicircle absolute origin stays at the ring's (0,0): no shift, no
      // change of rotation center → arcs are not deformed.
      for (const box of [first, second]) {
        assert.equal(box.clip.left + box.inner.left, 0);
        assert.equal(box.clip.top + box.inner.top, 0);
      }
      // First clip owns x ∈ [half, size+bleed]; second x ∈ [-bleed, half].
      assert.equal(first.clip.left, half);
      assert.equal(second.clip.left + second.clip.width, half);
      // Bleed only on outer sides, bounded by `bleed`.
      assert.equal(first.clip.left + first.clip.width, size + bleed);
      assert.equal(second.clip.left, -bleed);
      for (const box of [first, second]) {
        assert.equal(box.clip.top, -bleed);
        assert.equal(box.clip.top + box.clip.height, size + bleed);
      }
      assert.ok(bleed > 0 && bleed <= 1);
    });
  }
});
