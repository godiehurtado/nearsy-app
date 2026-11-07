import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildAlertSeenWrite,
  countUnseenAlerts,
  isAlertUnseen,
  shouldHonorNearbyLeave,
} from '../alerts/alertAppearance.ts';
import { parseEncounterNotifyPayload } from '../alerts/encounterNotifyPayload.ts';
import {
  resolveContactsSyncEnabled,
  resolveNotifyNearbyContacts,
  resolveNotifyNearbyInterests,
} from '../alerts/notifyPrefs.ts';
import {
  createMemoryReevaluatePendingStore,
  registerReevaluatePendingStore,
} from '../alerts/reevaluatePendingStore.ts';
import {
  registerReevaluateProximityNoticesInvoker,
  reevaluateProximityNoticesNow,
  resumePendingReevaluateProximityNotices,
  scheduleReevaluateProximityNotices,
} from '../alerts/reevaluateProximityNotices.ts';
import {
  enableAndSyncContacts,
  syncGrantedAddressBook,
  withdrawContactSource,
} from '../contacts/controller.ts';
import { ContactsHmacClientError } from '../contacts/errors.ts';
import {
  createFakeContactsHmacClient,
  createMemoryContactsSessionStore,
} from '../contacts/fakeClient.ts';
import {
  fingerprintIdentifiers,
  nextSnapshotVersion,
  selectUploadableIdentifiers,
} from '../contacts/identifiers.ts';
import { mapExpoPermission } from '../contacts/iosAddressBook.ts';
import {
  buildSyncContactHashesRequest,
  isIdempotentSyncResult,
  parseContactsWireResult,
  shouldCallReevaluateAfterIdentity,
} from '../contacts/parse.ts';
import { decideContactsPermissionAction } from '../contacts/syncPolicy.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('encounter-notify payload', () => {
  it('keeps kind=contact_nearby + actorUid and prefers motive over fromContacts', () => {
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
      fromContacts: false,
    });
    assert.equal(both?.motive, 'both');
    assert.equal(both?.fromContacts, true);
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
  });
});

describe('alert appearance', () => {
  it('uses appearanceKey when present and does not invent leave on truncated', () => {
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

describe('Identity Contacts HMAC wire', () => {
  it('parses the full ContactsWireResult without expectedEpoch or hashes', () => {
    const parsed = parseContactsWireResult({
      result: 'synced',
      contactsSyncEnabled: true,
      contactsEpoch: 4,
      notifyNearbyContactsEffective: true,
      sourceId: 'ios_testdevice01',
      snapshotVersion: 2,
      identifierCount: 3,
      keyCount: 1,
      syncCommitted: true,
      reevaluateRequired: true,
    });
    assert.equal(parsed.result, 'synced');
    assert.equal(parsed.contactsEpoch, 4);
    assert.equal(parsed.identifierCount, 3);
    assert.equal(parsed.keyCount, 1);
    assert.equal(shouldCallReevaluateAfterIdentity(parsed), true);
    assert.equal(
      isIdempotentSyncResult({ ...parsed, result: 'idempotent', reevaluateRequired: false }),
      true,
    );

    const request = buildSyncContactHashesRequest({
      sourceId: 'ios_testdevice01',
      snapshotVersion: 2,
      contactsEpoch: 4,
      identifiers: [{ kind: 'email', value: 'a@b.co' }],
    });
    assert.equal('expectedEpoch' in request, false);
    assert.equal('hashes' in request, false);
    assert.equal(request.contactsEpoch, 4);
  });

  it('reuses snapshotVersion for the same normalized identifier set', () => {
    const first = selectUploadableIdentifiers([
      { phoneNumbers: [{ number: '+15551234567' }], emails: [] },
    ]);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const fingerprint = fingerprintIdentifiers(first.identifiers);
    assert.equal(
      nextSnapshotVersion({
        lastVersion: 3,
        lastFingerprint: fingerprint,
        nextFingerprint: fingerprint,
      }),
      3,
    );
    assert.equal(
      nextSnapshotVersion({
        lastVersion: 3,
        lastFingerprint: fingerprint,
        nextFingerprint: 'changed',
      }),
      4,
    );
  });

  it('treats empty granted book as a valid snapshot and OS deny as remove-source', () => {
    const empty = selectUploadableIdentifiers([]);
    assert.equal(empty.ok, true);
    if (empty.ok) assert.equal(empty.identifiers.length, 0);
    assert.equal(decideContactsPermissionAction('granted'), 'sync');
    assert.equal(decideContactsPermissionAction('limited'), 'sync');
    assert.equal(decideContactsPermissionAction('denied'), 'remove-source');
    assert.equal(mapExpoPermission('granted'), 'granted');
    assert.equal(mapExpoPermission('granted', 'limited'), 'limited');
    assert.equal(mapExpoPermission('limited'), 'limited');
    assert.equal(mapExpoPermission('denied'), 'denied');
  });

  it('keeps monotonic snapshotVersion after remove for a stable sourceId', async () => {
    const session = createMemoryContactsSessionStore({
      sourceId: 'ios_testdevice01',
      contactsEpoch: 2,
      snapshotVersion: 5,
      fingerprint: 'abc:1',
    });
    const client = createFakeContactsHmacClient({
      removeContactSource: async (request) =>
        parseContactsWireResult({
          result: 'removed',
          contactsSyncEnabled: true,
          contactsEpoch: request.contactsEpoch,
          notifyNearbyContactsEffective: true,
          sourceId: request.sourceId,
          snapshotVersion: 5,
          syncCommitted: true,
          reevaluateRequired: true,
        }),
    });
    const withdrawn = await withdrawContactSource({
      client,
      session,
      book: {
        getPermission: async () => 'denied',
        requestPermission: async () => 'denied',
        readRows: async () => [],
      },
    });
    assert.equal(withdrawn.ok, true);
    const afterRemove = session.peek();
    assert.equal(afterRemove.sourceId, 'ios_testdevice01');
    assert.equal(afterRemove.snapshotVersion, 5);
    assert.equal(afterRemove.fingerprint, null);

    const next = nextSnapshotVersion({
      lastVersion: afterRemove.snapshotVersion,
      lastFingerprint: afterRemove.fingerprint,
      nextFingerprint: 'def:1',
    });
    assert.equal(next, 6);
    assert.ok(next > 5);
  });

  it('keeps durable reevaluate pending across idempotent and isolates by uid', async () => {
    const pending = createMemoryReevaluatePendingStore();
    registerReevaluatePendingStore(pending);
    const invokes: string[] = [];
    let currentUid = 'uid-a';
    registerReevaluateProximityNoticesInvoker(
      async (uid) => {
        invokes.push(uid);
      },
      () => currentUid,
    );

    scheduleReevaluateProximityNotices();
    assert.equal(pending.peek(), 'uid-a');

    const idempotent = parseContactsWireResult({
      result: 'idempotent',
      contactsSyncEnabled: true,
      contactsEpoch: 1,
      notifyNearbyContactsEffective: true,
      sourceId: 'ios_testdevice01',
      snapshotVersion: 2,
      identifierCount: 1,
      keyCount: 0,
      syncCommitted: true,
      reevaluateRequired: false,
    });
    assert.equal(shouldCallReevaluateAfterIdentity(idempotent), false);
    assert.equal(isIdempotentSyncResult(idempotent), true);
    assert.equal(pending.peek(), 'uid-a');

    currentUid = 'uid-b';
    await resumePendingReevaluateProximityNotices();
    assert.equal(pending.peek(), 'uid-a');
    assert.equal(invokes.length, 0);

    currentUid = 'uid-a';
    await reevaluateProximityNoticesNow();
    assert.deepEqual(invokes, ['uid-a']);
    assert.equal(pending.peek(), null);
  });

  it('does not mark the book synced on epoch mismatch or identifier cap', async () => {
    const session = createMemoryContactsSessionStore({
      sourceId: 'ios_testdevice01',
      contactsEpoch: 1,
    });
    const client = createFakeContactsHmacClient({
      syncContactHashes: async () => {
        throw new ContactsHmacClientError(
          'contacts-epoch-mismatch',
          'Contacts epoch does not match. (contacts-epoch-mismatch)',
        );
      },
    });
    const outcome = await syncGrantedAddressBook({
      client,
      session,
      book: {
        getPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        readRows: async () => [{ emails: [{ email: 'a@b.co' }] }],
      },
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.bookSynced, false);

    const cap = selectUploadableIdentifiers(
      Array.from({ length: 501 }, (_, i) => ({
        emails: [{ email: `user${i}@example.com` }],
      })),
    );
    assert.equal(cap.ok, false);
  });

  it('does not upload empty when OS Contacts is denied', async () => {
    const session = createMemoryContactsSessionStore({
      sourceId: 'ios_testdevice01',
      contactsEpoch: 2,
    });
    const client = createFakeContactsHmacClient();
    const outcome = await enableAndSyncContacts({
      client,
      session,
      book: {
        getPermission: async () => 'denied',
        requestPermission: async () => 'denied',
        readRows: async () => {
          throw new Error('must not read the book');
        },
      },
    });
    assert.equal(outcome.bookSynced, false);
    assert.equal(
      client.calls.some((call) => call.name === 'syncContactHashes'),
      false,
    );
    assert.equal(
      client.calls.some((call) => call.name === 'removeContactSource'),
      true,
    );
  });
});

describe('iOS wiring', () => {
  it('marks Alerts seen on row open and badges unseen count', () => {
    const alerts = readSrc('screens/AlertsScreen.tsx');
    const tabs = readSrc('navigation/RootTabs.tsx');
    const app = readSrc('App.tsx');
    const more = readSrc('screens/MoreScreen.tsx');
    assert.match(alerts, /markAlertOpened/);
    assert.match(tabs, /unseenCount/);
    assert.match(app, /createPushOpenCoordinator/);
    assert.match(
      readSrc('alerts/pushOpenCoordinator.ts'),
      /parseEncounterNotifyPayload/,
    );
    assert.match(app, /resumePendingReevaluateProximityNotices/);
    assert.match(more, /enableAndSyncContacts/);
    assert.match(more, /notifyNearbyContacts/);
    assert.doesNotMatch(more, /expectedEpoch/);
  });

  it('ships expo-contacts plugin, dependency, and NSContactsUsageDescription', () => {
    const root = join(ROOT, '../../..');
    const appJson = readFileSync(join(root, 'apps/nearsy-ios/app.json'), 'utf8');
    const appConfig = readFileSync(join(root, 'apps/nearsy-ios/app.config.js'), 'utf8');
    const pkg = readFileSync(join(root, 'apps/nearsy-ios/package.json'), 'utf8');
    assert.match(pkg, /"expo-contacts":\s*"~15\.0\.11"/);
    assert.match(appJson, /NSContactsUsageDescription/);
    assert.match(appJson, /expo-contacts/);
    assert.match(appConfig, /expo-contacts/);
    assert.doesNotMatch(readSrc('contacts/controller.ts'), /clearSnapshotVersion/);
    assert.match(readSrc('contacts/controller.ts'), /clearFingerprint/);
    assert.doesNotMatch(readSrc('contacts/wireTypes.ts'), /expectedEpoch/);
    assert.doesNotMatch(readSrc('contacts/parse.ts'), /expectedEpoch/);
  });
});
