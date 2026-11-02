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
  identifiersFingerprint,
  parseContactsWireResult,
  shouldScheduleReevaluate,
  snapshotVersionForUpload,
  syncContactHashes,
} from '../contactsHmac/contactsHmacCore.ts';
import {
  runDisable,
  runEnableThenSync,
} from '../contactsHmac/contactsSyncFlow.ts';

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
});

describe('Identity contacts HMAC wire', () => {
  it('uses Identity names, contactsEpoch, and the full success shape', () => {
    assert.equal(ENABLE_CONTACTS_SYNC, 'enableContactsSync');
    assert.equal(SYNC_CONTACT_HASHES, 'syncContactHashes');
    assert.equal(DISABLE_CONTACTS_SYNC, 'disableContactsSync');
    assert.equal(REMOVE_CONTACT_SOURCE, 'removeContactSource');
    assert.equal(REFRESH_VERIFIED_ACTOR_KEYS, 'refreshVerifiedActorKeys');
    assert.deepEqual(Object.keys(buildEnableRequest()), []);
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
        nextFingerprint: `${fingerprint}\nemail:other@x.co`,
      }),
      3,
    );
    const tooMany = collectContactIdentifiers(
      Array.from({ length: CONTACT_HASH_CAP + 1 }, (_, i) => ({
        emails: [{ email: `u${i}@ex.co` }],
      })),
    );
    assert.equal(tooMany.ok, false);
  });

  it('does not upload empty when OS permission is denied', async () => {
    const calls: Array<{ name: string; data: unknown }> = [];
    const functions = {
      region: 'us-central1',
      async call(name: string, data?: unknown) {
        calls.push({ name, data });
        if (name === ENABLE_CONTACTS_SYNC) {
          return {
            result: 'enabled',
            contactsSyncEnabled: true,
            contactsEpoch: 0,
            notifyNearbyContactsEffective: true,
            keyCount: 1,
            syncCommitted: true,
            reevaluateRequired: true,
          };
        }
        if (name === REMOVE_CONTACT_SOURCE) {
          return {
            result: 'absent',
            contactsSyncEnabled: true,
            contactsEpoch: 0,
            notifyNearbyContactsEffective: true,
            sourceId: 'sourceId1',
            syncCommitted: true,
            reevaluateRequired: false,
          };
        }
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
        lastAckedVersion: null,
        lastAckedFingerprint: null,
      },
    });
    assert.equal(outcome.result.result, 'absent');
    assert.deepEqual(
      calls.map((c) => c.name),
      [ENABLE_CONTACTS_SYNC, REMOVE_CONTACT_SOURCE],
    );
    assert.ok(!calls.some((c) => c.name === SYNC_CONTACT_HASHES));
  });

  it('sends an empty granted book and does not restore snapshots after disable', async () => {
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
        lastAckedFingerprint: 'email:ada@b.co',
      },
    });
    assert.equal(disabled.state.contactsEpoch, 5);
    assert.equal(disabled.state.lastAckedVersion, null);
    assert.equal(disabled.state.lastAckedFingerprint, null);
    assert.equal(disabled.scheduleReevaluate, true);
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
    assert.match(more, /enableThenSyncContacts/);
    assert.match(more, /disableContactsIntegration/);
    assert.match(more, /buildNotifyNearbyContactsPatch/);
    assert.match(core, /ENABLE_CONTACTS_SYNC/);
    assert.match(core, /SYNC_CONTACT_HASHES/);
    assert.match(core, /REMOVE_CONTACT_SOURCE/);
    assert.match(core, /REFRESH_VERIFIED_ACTOR_KEYS/);
    assert.match(android, /runEnableThenSync/);
    assert.match(android, /httpsCallable/);
    assert.doesNotMatch(android, /expectedEpoch/);
    assert.match(core, /'expectedEpoch' in rec/);
    assert.doesNotMatch(android, /enableContactSync/);
    assert.doesNotMatch(android, /deleteContactSource/);
    assert.match(otp, /refreshContactsActorKeys/);
    assert.match(readSrc('alerts/reevaluateProximityNotices.ts'), /bindSession/);
    assert.match(
      readSrc('alerts/reevaluateProximityNotices.android.ts'),
      /onAuthStateChanged/,
    );
  });
});
