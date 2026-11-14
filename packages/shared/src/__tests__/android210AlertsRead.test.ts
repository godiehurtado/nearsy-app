/**
 * QA 2.1.0 item 5: opening an alert marks it read and lowers the bell badge;
 * the real unread count survives refreshes, returning from the detail, push
 * entry and account changes. Criterion agreed with iOS:
 * - read = the detail opened, from the inbox row or from its push once the app
 *   actually navigated to the profile; seeing the tab or a row does not count;
 * - per appearance (server appearanceKey): a new appearance is unread again;
 * - badge = unread for the signed-in uid only, "9+" above 9.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildAlertSeenWrite,
  countUnseenAlerts,
  isAlertUnseen,
  mergeSeenMaps,
} from '../alerts/alertAppearance.ts';
import { createPushOpenNotes, PUSH_OPEN_NOTE_TTL_MS } from '../alerts/pushOpenNotes.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, '..', rel), 'utf8');

describe('unread count', () => {
  const alerts = [
    { uid: 'a', appearanceKey: 'a:3' },
    { uid: 'b', appearanceKey: 'b:1' },
  ];

  it('an open lowers the count; a new appearance of that peer is unread again', () => {
    assert.equal(countUnseenAlerts(alerts, {}), 2);
    const seen = { a: buildAlertSeenWrite('a:3', 1000) };
    assert.equal(countUnseenAlerts(alerts, seen), 1);
    assert.equal(isAlertUnseen('a:4', seen.a), true);
  });

  it('a refresh or late snapshot never undoes a local open (newer seenAt wins)', () => {
    const local = { a: { appearanceKey: 'a:3', seenAt: 2000 } };
    // Server snapshot from before the write landed (or the write failed).
    const loaded = { a: { appearanceKey: 'a:2', seenAt: 1000 } };
    const merged = mergeSeenMaps(loaded, local);
    assert.deepEqual(merged.a, local.a);
    assert.equal(countUnseenAlerts(alerts, merged), 1);
    // A newer server record (another device) wins over an older local one.
    const newer = mergeSeenMaps({ a: { appearanceKey: 'a:3', seenAt: 3000 } }, local);
    assert.equal(newer.a!.seenAt, 3000);
    assert.deepEqual(mergeSeenMaps({ b: { seenAt: 5 } }, {}), { b: { seenAt: 5 } });
  });
});

describe('push open notes', () => {
  it('per viewer, deduplicated, never for oneself, expire after 10 minutes', () => {
    let t = 0;
    const notes = createPushOpenNotes(() => t);
    notes.note('viewer', 'peer');
    notes.note('viewer', 'peer');
    notes.note('viewer', 'viewer');
    notes.note(null, 'peer');
    notes.note('other', 'peer2');
    assert.deepEqual(notes.pendingFor('viewer'), ['peer']);
    assert.deepEqual(notes.pendingFor('other'), ['peer2']);
    assert.deepEqual(notes.pendingFor(null), []);
    notes.resolve('viewer', 'peer');
    assert.deepEqual(notes.pendingFor('viewer'), []);
    notes.note('viewer', 'late');
    t += PUSH_OPEN_NOTE_TTL_MS + 1;
    assert.deepEqual(notes.pendingFor('viewer'), []);
  });

  it('subscribers hear each new note', () => {
    const notes = createPushOpenNotes(() => 0);
    let heard = 0;
    const off = notes.subscribe(() => {
      heard += 1;
    });
    notes.note('viewer', 'peer');
    off();
    notes.note('viewer', 'peer2');
    assert.equal(heard, 1);
  });
});

describe('wiring', () => {
  const hook = read('hooks/useNearbyAlerts.ts');

  it('one shared state feeds the inbox and the badge ("9+")', () => {
    assert.match(read('navigation/RootTabs.tsx'), /<NearbyAlertsProvider>/);
    assert.match(read('navigation/RootTabs.tsx'), /alertsCount > 9 \? '9\+' : alertsCount/);
    assert.match(read('screens/AlertsScreen.tsx'), /void markAlertOpened\(item\)/);
  });

  it('loaded maps merge local opens; local opens are per uid and reset on account change', () => {
    assert.match(hook, /const map = mergeSeenMaps\(loaded, local\)/);
    assert.match(hook, /localOpensRef\.current\.uid !== authUid\) \{\s*localOpensRef\.current = \{ uid: authUid, map: \{\} \}/);
    assert.match(hook, /seenByPeerRef\.current = \{ \.\.\.seenByPeerRef\.current, \[peerUid\]: record \}/);
  });

  it('no write without a live appearanceKey (the rules require it)', () => {
    assert.match(hook, /if \(!record\.appearanceKey\) return;\s*try \{\s*await writeAlertSeen/);
  });

  it('a push open is noted only when the profile actually opens, and resolved when listed', () => {
    const opens = read('analytics/alertPushOpens.ts');
    assert.match(opens, /screen: 'DiscoveryProfile',[^]*?pushOpenNotes\.note\(firebaseAuth\.currentUser\?\.uid \?\? null, actorUid\)/);
    assert.match(hook, /pushOpenNotes\.pendingFor\(authUid\)/);
    assert.match(hook, /pushOpenNotes\.resolve\(authUid, actorUid\);\s*if \(row\.unseen !== false\) void markAlertOpened\(row\)/);
  });
});
