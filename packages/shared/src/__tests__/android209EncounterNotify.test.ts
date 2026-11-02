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

describe('Android wiring', () => {
  it('marks Alerts seen on row open and badges unseen count', () => {
    const alerts = readSrc('screens/AlertsScreen.tsx');
    const tabs = readSrc('navigation/RootTabs.tsx');
    const app = readSrc('App.tsx');
    assert.match(alerts, /markAlertOpened/);
    assert.match(tabs, /unseenCount/);
    assert.match(app, /parseEncounterNotifyPayload/);
    assert.doesNotMatch(readSrc('hooks/useNearbyAlerts.ts'), /syncContactHashes/);
    assert.doesNotMatch(readSrc('hooks/useNearbyAlerts.ts'), /READ_CONTACTS/);
  });
});
