import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildAlertSeenWrite,
  countUnseenAlerts,
  isAlertUnseen,
  parseAppearanceKey,
  shouldHonorNearbyLeave,
} from '../alerts/alertAppearance.ts';
import { parseEncounterNotifyPayload } from '../alerts/encounterNotifyPayload.ts';
import {
  clearPendingReevaluate,
  isPendingReevaluate,
  markPendingReevaluate,
} from '../alerts/pendingReevaluateStore.ts';
import {
  createReevaluateDebouncer,
  resetReevaluateProximityNoticesForTests,
} from '../alerts/reevaluateProximityNotices.ts';
import {
  buildNotifyNearbyContactsPatch,
  resolveContactsSyncEnabled,
  resolveNotifyNearbyContacts,
  resolveNotifyNearbyInterests,
} from '../alerts/notifyPrefs.ts';
import {
  applyUnseenFlags,
  mapDiscoverResultsToInterestAlerts,
} from '../hooks/nearbyAlertsMapping.ts';
import {
  BANNED_CONTACTS_WIRE_FIELDS,
  CONTACT_HASH_CAP,
  CONTACT_SOURCE_CAP,
  DISABLE_CONTACTS_SYNC,
  ENABLE_CONTACTS_SYNC,
  REFRESH_VERIFIED_ACTOR_KEYS,
  REMOVE_CONTACT_SOURCE,
  SYNC_CONTACT_HASHES,
} from '../contactsHmac/contactsHmacContract.ts';
import {
  buildDisableRequest,
  buildEnableRequest,
  buildRemoveSourceRequest,
  buildSyncRequest,
  collectContactIdentifiers,
  ContactsHmacError,
  contactsHmacErrorToI18nKey,
  identifiersFingerprint,
  isContactsHardCapOrFenceError,
  parseContactsWireResult,
  removedSnapshotFloorAfterRemove,
  shouldScheduleReevaluate,
  snapshotVersionForUpload,
  syncContactHashes,
} from '../contactsHmac/contactsHmacCore.ts';
import {
  runDisable,
  runEnableThenSync,
} from '../contactsHmac/contactsSyncFlow.ts';
import {
  loadContactsLocalState,
  persistContactsLocalState,
} from '../contactsHmac/contactsSource.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('encounter-notify payload', () => {
  it('keeps kind=contact_nearby + actorUid and optional motive/fromContacts', () => {
    const interest = parseEncounterNotifyPayload({
      kind: 'contact_nearby',
      actorUid: 'u1',
    });
    assert.equal(interest?.motive, 'interest');
    assert.equal(interest?.fromContacts, false);

    const legacyContact = parseEncounterNotifyPayload({
      kind: 'contact_nearby',
      actorUid: 'u2',
      fromContacts: true,
    });
    assert.equal(legacyContact?.motive, 'contact');
    assert.equal(legacyContact?.fromContacts, true);

    const both = parseEncounterNotifyPayload({
      kind: 'contact_nearby',
      actorUid: 'u3',
      motive: 'both',
      fromContacts: true,
    });
    assert.equal(both?.motive, 'both');
    assert.equal(parseEncounterNotifyPayload({ kind: 'other', actorUid: 'u' }), null);
  });
});

describe('notify prefs defaults', () => {
  it('defaults interests on and contacts sync off', () => {
    assert.equal(resolveNotifyNearbyInterests(undefined), true);
    assert.equal(resolveNotifyNearbyInterests(false), false);
    assert.equal(resolveContactsSyncEnabled(undefined), false);
    assert.equal(
      resolveNotifyNearbyContacts({ contactsSyncEnabled: undefined }),
      false,
    );
    assert.equal(
      resolveNotifyNearbyContacts({ contactsSyncEnabled: true }),
      true,
    );
    assert.equal(
      resolveNotifyNearbyContacts({
        contactsSyncEnabled: true,
        notifyNearbyContacts: false,
      }),
      false,
    );
    assert.deepEqual(buildNotifyNearbyContactsPatch(false), {
      notifyNearbyContacts: false,
    });
  });
});

describe('alert appearance', () => {
  it('consumes server appearanceKey and does not invent leave on truncated', () => {
    assert.equal(parseAppearanceKey('p1:1'), 'p1:1');
    assert.equal(parseAppearanceKey('  '), undefined);
    assert.equal(isAlertUnseen('p1:1', undefined), true);
    assert.equal(isAlertUnseen('p1:1', { appearanceKey: 'p1:1', seenAt: 1 }), false);
    assert.equal(isAlertUnseen('p1:2', { appearanceKey: 'p1:1', seenAt: 1 }), true);
    assert.equal(isAlertUnseen(undefined, { seenAt: 9 }), false);
    assert.equal(isAlertUnseen(undefined, undefined), true);
    assert.equal(shouldHonorNearbyLeave({ truncated: true, complete: true }), false);
    assert.equal(shouldHonorNearbyLeave({ complete: true, truncated: false }), true);
    assert.equal(
      countUnseenAlerts(
        [{ uid: 'p1', appearanceKey: 'p1:1' }, { uid: 'p2' }],
        { p1: { appearanceKey: 'p1:1', seenAt: 1 } },
      ),
      1,
    );
    assert.deepEqual(buildAlertSeenWrite('p1:3', 10), {
      appearanceKey: 'p1:3',
      seenAt: 10,
    });
    assert.deepEqual(buildAlertSeenWrite(undefined, 10), { seenAt: 10 });
  });

  it('copies appearanceKey from discoverNearby and never concatenates seq', () => {
    const mapped = mapDiscoverResultsToInterestAlerts(
      [
        {
          uid: 'peer-1',
          distanceMeters: 10,
          profile: {
            mode: 'personal',
            displayName: 'Ada',
            profileImage: null,
            occupation: '',
            interestIds: ['sports_soccer'],
          },
          appearanceKey: 'peer-1:4',
        },
      ],
      new Set(['sports_soccer']),
      1,
      'me',
    );
    assert.equal(mapped[0]?.appearanceKey, 'peer-1:4');
    const flagged = applyUnseenFlags(mapped, {});
    assert.equal(flagged[0]?.unseen, true);

    const mapping = readSrc('hooks/nearbyAlertsMapping.ts');
    const appearance = readSrc('alerts/alertAppearance.ts');
    assert.doesNotMatch(mapping, /appearanceSeq/);
    assert.doesNotMatch(mapping, /uid \+ ':'/);
    assert.doesNotMatch(mapping, /alertPresence/);
    assert.match(appearance, /must not rebuild presence/);
    assert.doesNotMatch(readSrc('hooks/useNearbyAlerts.ts'), /peerUid \+ ':'/);
  });
});

describe('discoverNearby additive fields', () => {
  it('parses appearanceKey/complete/truncated without requiring them', () => {
    const parse = readSrc('visibility/callables/parse.ts');
    const types = readSrc('visibility/callables/wireTypes.ts');
    assert.match(parse, /appearanceKey/);
    assert.match(parse, /data\.complete/);
    assert.match(parse, /data\.truncated/);
    assert.match(types, /appearanceKey\?: string/);
    assert.match(types, /complete\?: boolean/);
  });
});

describe('alertSeen subscription', () => {
  it('subscribes per viewer uid and clears on change', () => {
    const android = readSrc('alerts/alertSeenStore.android.ts');
    const hook = readSrc('hooks/useNearbyAlerts.ts');
    assert.match(android, /subscribeAlertSeenMap/);
    assert.match(android, /onSnapshot/);
    assert.match(android, /firebaseAuth\.currentUser\?\.uid !== viewerUid/);
    assert.match(hook, /subscribeAlertSeenMap\(authUid/);
    assert.match(hook, /unsubSeen\(\)/);
    assert.match(hook, /setSeenByPeer\(\{\}\)/);
  });
});

describe('reevaluate debounce', () => {
  it('cancels the previous session and keeps the trailing burst', async () => {
    resetReevaluateProximityNoticesForTests();
    const calls: string[] = [];
    const timers = new Map<number, () => void>();
    let nextId = 1;
    const debouncer = createReevaluateDebouncer({
      debounceMs: 10_000,
      scheduleTimer: (fn) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, fn);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      cancelTimer: (id) => {
        timers.delete(id as unknown as number);
      },
    });
    debouncer.bindSession('uid-a');
    debouncer.register(async () => {
      calls.push('a');
    });
    debouncer.schedule();
    debouncer.schedule();
    assert.equal(timers.size, 1);
    debouncer.bindSession('uid-b');
    assert.equal(timers.size, 0);
    debouncer.register(async () => {
      calls.push('b');
    });
    debouncer.schedule();
    assert.equal(timers.size, 1);
    const fire = [...timers.values()][0];
    fire();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(calls, ['b']);
  });

  it('keeps durable pending per UID and retries Functions only', async () => {
    const mem = new Map<string, string>();
    const store = {
      async getItem(key: string) {
        return mem.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        mem.set(key, value);
      },
      async removeItem(key: string) {
        mem.delete(key);
      },
    };
    await markPendingReevaluate(store, 'uid-a');
    assert.equal(await isPendingReevaluate(store, 'uid-a'), true);
    assert.equal(await isPendingReevaluate(store, 'uid-b'), false);

    const calls: string[] = [];
    const timers = new Map<number, () => void>();
    let nextId = 1;
    let failOnce = true;
    const debouncer = createReevaluateDebouncer({
      debounceMs: 10_000,
      scheduleTimer: (fn) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, () => {
          timers.delete(id);
          fn();
        });
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      cancelTimer: (id) => {
        timers.delete(id as unknown as number);
      },
    });
    debouncer.setPendingHooks({
      mark: (uid) => markPendingReevaluate(store, uid),
      clear: (uid) => clearPendingReevaluate(store, uid),
      isPending: (uid) => isPendingReevaluate(store, uid),
    });
    debouncer.bindSession('uid-a');
    debouncer.register(async () => {
      calls.push('reeval');
      if (failOnce) {
        failOnce = false;
        throw new Error('functions lease');
      }
    });
    debouncer.schedule();
    assert.equal(timers.size, 1);
    const first = [...timers.values()][0];
    first();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(await isPendingReevaluate(store, 'uid-a'), true);
    assert.equal(calls.length, 1);
    // Failure re-arms a trailing retry for the same session.
    assert.equal(timers.size, 1);
    timers.clear();

    debouncer.bindSession('uid-b');
    assert.equal(debouncer.isPending(), false);
    assert.equal(await isPendingReevaluate(store, 'uid-a'), true);

    debouncer.bindSession('uid-a');
    await debouncer.resumePendingIfNeeded();
    assert.equal(timers.size, 1);
    const second = [...timers.values()][0];
    second();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls.length, 2);
    assert.equal(await isPendingReevaluate(store, 'uid-a'), false);
  });
});

describe('Identity contacts HMAC wire', () => {
  it('uses Identity names, contactsEpoch, and the full success shape', () => {
    assert.equal(ENABLE_CONTACTS_SYNC, 'enableContactsSync');
    assert.equal(SYNC_CONTACT_HASHES, 'syncContactHashes');
    assert.equal(DISABLE_CONTACTS_SYNC, 'disableContactsSync');
    assert.equal(REMOVE_CONTACT_SOURCE, 'removeContactSource');
    assert.equal(REFRESH_VERIFIED_ACTOR_KEYS, 'refreshVerifiedActorKeys');
    assert.deepEqual(buildEnableRequest(3), { contactsEpoch: 3 });
    assert.deepEqual(buildDisableRequest(3), { contactsEpoch: 3 });
    assert.deepEqual(buildRemoveSourceRequest('sourceId1', 2), {
      sourceId: 'sourceId1',
      contactsEpoch: 2,
    });
    const sync = buildSyncRequest({
      sourceId: 'sourceId1',
      snapshotVersion: 1,
      contactsEpoch: 0,
      identifiers: [{ kind: 'email', value: 'a@b.co' }],
    });
    assert.deepEqual(Object.keys(sync).sort(), [
      'contactsEpoch',
      'identifiers',
      'snapshotVersion',
      'sourceId',
    ]);
    assert.ok(!('expectedEpoch' in sync));
    for (const banned of BANNED_CONTACTS_WIRE_FIELDS) {
      assert.ok(!(banned in sync));
    }

    const parsed = parseContactsWireResult({
      result: 'synced',
      contactsSyncEnabled: true,
      contactsEpoch: 0,
      notifyNearbyContactsEffective: true,
      sourceId: 'sourceId1',
      snapshotVersion: 1,
      identifierCount: 1,
      keyCount: 2,
      syncCommitted: true,
      reevaluateRequired: true,
    });
    assert.equal(parsed.identifierCount, 1);
    assert.equal(parsed.keyCount, 2);
    assert.equal(shouldScheduleReevaluate(parsed), true);
    assert.equal(
      shouldScheduleReevaluate({ ...parsed, reevaluateRequired: false }),
      false,
    );
    assert.throws(() =>
      parseContactsWireResult({ ...parsed, expectedEpoch: 1 }),
    );
  });

  it('treats same snapshotVersion + same normalized set as idempotent and does not truncate', () => {
    const identifiers = collectContactIdentifiers([
      {
        emails: [{ email: 'Ada@B.co' }, { email: 'ada@b.co' }],
        phoneNumbers: [{ number: '+14155550100' }, { number: '415-555-0100' }],
      },
    ]);
    assert.equal(identifiers.ok, true);
    if (!identifiers.ok) return;
    assert.deepEqual(identifiers.identifiers, [
      { kind: 'email', value: 'ada@b.co' },
      { kind: 'phone', value: '+14155550100' },
    ]);
    const fingerprint = identifiersFingerprint(identifiers.identifiers);
    assert.match(fingerprint, /^fp1:/);
    assert.doesNotMatch(fingerprint, /ada@b\.co|\+14155550100/);
    assert.equal(
      snapshotVersionForUpload({
        lastAckedVersion: 2,
        lastAckedFingerprint: fingerprint,
        nextFingerprint: fingerprint,
      }),
      2,
    );
    assert.equal(
      snapshotVersionForUpload({
        lastAckedVersion: 2,
        lastAckedFingerprint: fingerprint,
        nextFingerprint: identifiersFingerprint([
          ...identifiers.identifiers,
          { kind: 'email', value: 'other@x.co' },
        ]),
      }),
      3,
    );
    const tooMany = collectContactIdentifiers(
      Array.from({ length: CONTACT_HASH_CAP + 1 }, (_, i) => ({
        emails: [{ email: `u${i}@ex.co` }],
      })),
    );
    assert.equal(tooMany.ok, false);
    assert.equal(CONTACT_SOURCE_CAP, 8);
  });

  it('keeps snapshotVersion monotonic after remove/reconnect against a fence', () => {
    assert.equal(
      removedSnapshotFloorAfterRemove({
        previousFloor: null,
        removedSnapshotVersion: 3,
        lastAckedVersion: 3,
      }),
      3,
    );
    assert.equal(
      snapshotVersionForUpload({
        lastAckedVersion: null,
        lastAckedFingerprint: null,
        nextFingerprint: 'fp1:abc',
        removedSnapshotFloor: 3,
      }),
      4,
    );
    assert.equal(
      snapshotVersionForUpload({
        lastAckedVersion: null,
        lastAckedFingerprint: null,
        nextFingerprint: 'fp1:abc',
        removedSnapshotFloor: null,
      }),
      1,
    );
  });

  it('surfaces hard caps/fences without treating them as success', () => {
    assert.equal(contactsHmacErrorToI18nKey('contacts-identifier-cap'), 'identifierCap');
    assert.equal(contactsHmacErrorToI18nKey('contacts-union-cap'), 'unionCap');
    assert.equal(contactsHmacErrorToI18nKey('contacts-source-cap'), 'sourceCap');
    assert.equal(contactsHmacErrorToI18nKey('contacts-source-removed'), 'sourceRemoved');
    assert.equal(isContactsHardCapOrFenceError('contacts-union-cap'), true);
    assert.equal(isContactsHardCapOrFenceError('contacts-rate-limited'), false);
    const settings = readSrc('i18n/resources/settings.ts');
    assert.match(settings, /identifierCap:/);
    assert.match(settings, /unionCap:/);
    assert.match(settings, /sourceCap:/);
    assert.match(settings, /sourceRemoved:/);
    assert.doesNotMatch(settings, /Contacts were updated/);
  });

  it('does not call Identity or upload when OS permission is denied', async () => {
    const calls: Array<{ name: string; data: unknown }> = [];
    const functions = {
      region: 'us-central1',
      async call(name: string, data?: unknown) {
        calls.push({ name, data });
        throw new Error(`unexpected ${name}`);
      },
    };
    const outcome = await runEnableThenSync({
      functions,
      book: {
        getPermission: async () => 'denied',
        requestPermission: async () => 'denied',
        readRecords: async () => {
          throw new Error('must not read');
        },
      },
      state: {
        sourceId: 'sourceId1',
        contactsEpoch: 0,
        lastAckedVersion: 2,
        lastAckedFingerprint: 'fp1:deadbeef',
        removedSnapshotFloor: null,
        epochConfirmed: true,
      },
    });
    assert.equal(outcome.permission, 'denied');
    assert.equal(outcome.result.contactsSyncEnabled, false);
    assert.equal(outcome.state.lastAckedVersion, null);
    assert.deepEqual(calls, []);
    assert.ok(!calls.some((c) => c.name === SYNC_CONTACT_HASHES));
  });

  it('sends an empty granted book and clears fence floor after disable', async () => {
    const synced = parseContactsWireResult({
      result: 'idempotent',
      contactsSyncEnabled: true,
      contactsEpoch: 4,
      notifyNearbyContactsEffective: true,
      sourceId: 'sourceId1',
      snapshotVersion: 1,
      identifierCount: 0,
      keyCount: 1,
      syncCommitted: true,
      reevaluateRequired: false,
    });
    assert.equal(synced.result, 'idempotent');
    assert.equal(synced.identifierCount, 0);
    assert.equal(shouldScheduleReevaluate(synced), false);

    const disabled = await runDisable({
      functions: {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, DISABLE_CONTACTS_SYNC);
          assert.deepEqual(data, { contactsEpoch: 4 });
          return {
            result: 'disabled',
            contactsSyncEnabled: false,
            contactsEpoch: 5,
            notifyNearbyContactsEffective: false,
            keyCount: 1,
            syncCommitted: true,
            reevaluateRequired: true,
          };
        },
      },
      state: {
        sourceId: 'sourceId1',
        contactsEpoch: 4,
        lastAckedVersion: 1,
        lastAckedFingerprint: 'fp1:abc',
        removedSnapshotFloor: 7,
      },
    });
    assert.equal(disabled.state.contactsEpoch, 5);
    assert.equal(disabled.state.lastAckedVersion, null);
    assert.equal(disabled.state.lastAckedFingerprint, null);
    assert.equal(disabled.state.removedSnapshotFloor, null);
    assert.equal(disabled.scheduleReevaluate, true);
  });

  it('persists only opaque fingerprints and drops legacy raw ack material', async () => {
    const mem = new Map<string, string>();
    const store = {
      async getItem(key: string) {
        return mem.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        mem.set(key, value);
      },
    };
    await persistContactsLocalState(store, 'uid-a', {
      sourceId: 'sourceId1',
      contactsEpoch: 1,
      lastAckedVersion: 2,
      lastAckedFingerprint: 'fp1:abcdef01abcdef02',
      removedSnapshotFloor: 2,
    });
    const loaded = await loadContactsLocalState(store, 'uid-a', 'sourceId1');
    assert.equal(loaded.lastAckedFingerprint, 'fp1:abcdef01abcdef02');
    assert.doesNotMatch(JSON.stringify(loaded), /@|\+\d/);

    mem.set(
      'nearsy.contacts.state.v1:uid-a',
      JSON.stringify({
        contactsEpoch: 1,
        lastAckedVersion: 2,
        lastAckedFingerprint: 'email:ada@b.co',
        removedSnapshotFloor: 2,
      }),
    );
    const scrubbed = await loadContactsLocalState(store, 'uid-a', 'sourceId1');
    assert.equal(scrubbed.lastAckedFingerprint, null);
    assert.equal(scrubbed.removedSnapshotFloor, 2);
  });

  it('never sends expectedEpoch or client hashes on the Identity port', async () => {
    let body: unknown;
    await syncContactHashes(
      {
        region: 'us-central1',
        async call(name, data) {
          assert.equal(name, SYNC_CONTACT_HASHES);
          body = data;
          return {
            result: 'synced',
            contactsSyncEnabled: true,
            contactsEpoch: 0,
            notifyNearbyContactsEffective: true,
            sourceId: 'sourceId1',
            snapshotVersion: 1,
            identifierCount: 0,
            keyCount: 0,
            syncCommitted: true,
            reevaluateRequired: true,
          };
        },
      },
      {
        sourceId: 'sourceId1',
        snapshotVersion: 1,
        contactsEpoch: 0,
        identifiers: [],
      },
    );
    const rec = body as Record<string, unknown>;
    assert.equal('expectedEpoch' in rec, false);
    assert.equal('hashes' in rec, false);
    assert.equal('hash' in rec, false);
    assert.ok(Array.isArray(rec.identifiers));
  });
});

describe('Android wiring', () => {
  it('marks Alerts seen on row open and badges unseen count', () => {
    const alerts = readSrc('screens/AlertsScreen.tsx');
    const tabs = readSrc('navigation/RootTabs.tsx');
    const app = readSrc('App.tsx');
    assert.match(alerts, /markAlertOpened/);
    assert.match(tabs, /unseenCount/);
    assert.match(app, /parseEncounterNotifyPayload/);
    assert.doesNotMatch(readSrc('hooks/useNearbyAlerts.ts'), /READ_CONTACTS/);
    assert.doesNotMatch(readSrc('hooks/useNearbyAlerts.ts'), /expectedEpoch/);
  });

  it('wires Identity Contacts callables and Settings consent on Android only', () => {
    const more = readSrc('screens/MoreScreen.tsx');
    const android = readSrc('contactsHmac/contactsHmac.android.ts');
    const core = readSrc('contactsHmac/contactsHmacCore.ts');
    const otp = readSrc('screens/PhoneVerificationScreen.android.tsx');
    const appJson = readFileSync(
      join(ROOT, '..', '..', '..', 'apps', 'nearsy-android', 'app.json'),
      'utf8',
    );
    const reevalAndroid = readSrc('alerts/reevaluateProximityNotices.android.ts');
    assert.match(more, /enableThenSyncContacts/);
    assert.match(more, /disableContactsIntegration/);
    assert.match(more, /buildNotifyNearbyContactsPatch/);
    assert.match(more, /subscribeContactsSyncStatus/);
    assert.match(android, /onAuthStateChanged/);
    assert.match(core, /ENABLE_CONTACTS_SYNC/);
    assert.match(core, /SYNC_CONTACT_HASHES/);
    assert.match(core, /REMOVE_CONTACT_SOURCE/);
    assert.match(core, /REFRESH_VERIFIED_ACTOR_KEYS/);
    assert.match(core, /removedSnapshotFloor/);
    assert.match(core, /fp1:/);
    assert.match(readSrc('contactsHmac/contactsSyncSession.ts'), /runEnableThenSync/);
    assert.match(android, /httpsCallable/);
    assert.doesNotMatch(android, /expectedEpoch/);
    assert.match(core, /'expectedEpoch' in rec/);
    assert.doesNotMatch(android, /enableContactSync/);
    assert.doesNotMatch(android, /deleteContactSource/);
    assert.match(otp, /refreshContactsActorKeys/);
    assert.match(readSrc('alerts/reevaluateProximityNotices.ts'), /bindSession/);
    assert.match(readSrc('alerts/reevaluateProximityNotices.ts'), /resumePendingIfNeeded/);
    assert.match(reevalAndroid, /onAuthStateChanged/);
    assert.match(reevalAndroid, /bindReevaluateSession\(user\?\.uid/);
    assert.match(reevalAndroid, /pendingReevaluateStore/);
    const androidCfg = JSON.parse(appJson).expo.android;
    const plugins = (JSON.parse(appJson).expo.plugins ?? []).map(
      (p: unknown) => (Array.isArray(p) ? p[0] : p),
    );
    assert.equal(plugins.includes('expo-contacts'), true);
    assert.ok(androidCfg.permissions.includes('android.permission.READ_CONTACTS'));
    assert.ok(
      androidCfg.blockedPermissions.includes('android.permission.WRITE_CONTACTS'),
    );
    assert.equal(
      androidCfg.permissions.includes('android.permission.WRITE_CONTACTS'),
      false,
    );
  });
});
