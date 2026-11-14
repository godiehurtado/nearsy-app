/**
 * QA 2.1.0 point 5: opening an alert marks it read in every alerts view (bell
 * badge included), a refresh never undoes it, new appearances count again,
 * push opens count once the alert is listed, and nothing crosses accounts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { countUnseenAlerts, type AlertSeenRecord } from '../alerts/alertAppearance';
import {
  mergeSeenMaps,
  notePushAlertOpened,
  PENDING_PUSH_OPEN_TTL_MS,
  publishAlertOpened,
  resetAlertSeenSyncForTests,
  subscribeAlertOpened,
  takeResolvedPushOpens,
} from '../alerts/alertSeenSync';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

const alerts = [
  { uid: 'peerA', appearanceKey: 'peerA:3' },
  { uid: 'peerB', appearanceKey: 'peerB:1' },
];

beforeEach(() => resetAlertSeenSyncForTests());

describe('alerts read state (QA 2.1.0)', () => {
  it('an open reaches every subscribed view (badge and inbox) at once', () => {
    const badge: string[] = [];
    const inbox: string[] = [];
    const offBadge = subscribeAlertOpened((e) => badge.push(`${e.viewerUid}/${e.peerUid}`));
    subscribeAlertOpened((e) => inbox.push(`${e.viewerUid}/${e.peerUid}`));
    publishAlertOpened({ viewerUid: 'me', peerUid: 'peerA', record: { appearanceKey: 'peerA:3', seenAt: 1 } });
    assert.deepEqual(badge, ['me/peerA']);
    assert.deepEqual(inbox, ['me/peerA']);
    offBadge();
    publishAlertOpened({ viewerUid: 'me', peerUid: 'peerB', record: { seenAt: 2 } });
    assert.deepEqual(badge, ['me/peerA']);
  });

  it('the count drops by exactly the opened alert', () => {
    assert.equal(countUnseenAlerts(alerts, {}), 2);
    const seen = mergeSeenMaps({}, { peerA: { appearanceKey: 'peerA:3', seenAt: 10 } });
    assert.equal(countUnseenAlerts(alerts, seen), 1);
  });

  it('a refresh read before the write landed never undoes a newer local open', () => {
    const loaded: Record<string, AlertSeenRecord> = { peerA: { appearanceKey: 'peerA:2', seenAt: 5 } };
    const local: Record<string, AlertSeenRecord> = { peerA: { appearanceKey: 'peerA:3', seenAt: 10 } };
    const merged = mergeSeenMaps(loaded, local);
    assert.equal(merged.peerA?.appearanceKey, 'peerA:3');
    assert.equal(countUnseenAlerts(alerts, merged), 1);
    // A newer server record (another device) wins over an older local one.
    assert.equal(mergeSeenMaps({ peerA: { appearanceKey: 'peerA:4', seenAt: 20 } }, local).peerA?.seenAt, 20);
  });

  it('a new appearance of the same peer counts as unread again', () => {
    const seen = { peerA: { appearanceKey: 'peerA:3', seenAt: 10 } };
    assert.equal(countUnseenAlerts([{ uid: 'peerA', appearanceKey: 'peerA:4' }], seen), 1);
  });

  it('a push open is resolved once its alert is listed, with the live appearance key', () => {
    notePushAlertOpened('me', 'peerB', 100);
    assert.deepEqual(takeResolvedPushOpens('me', [], 200), []);
    const resolved = takeResolvedPushOpens('me', alerts, 300);
    assert.deepEqual(resolved, [{ peerUid: 'peerB', record: { appearanceKey: 'peerB:1', seenAt: 100 } }]);
    assert.deepEqual(takeResolvedPushOpens('me', alerts, 400), [], 'consumed once');
  });

  it('push opens never cross accounts and expire', () => {
    notePushAlertOpened('accountA', 'peerA', 0);
    assert.deepEqual(takeResolvedPushOpens('accountB', alerts, 1), []);
    assert.deepEqual(takeResolvedPushOpens('accountA', alerts, PENDING_PUSH_OPEN_TTL_MS + 1), []);
    assert.deepEqual(takeResolvedPushOpens('accountA', alerts, PENDING_PUSH_OPEN_TTL_MS + 2), []);
  });

  it('wiring: hook shares opens and merges refreshes; App notes push opens', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /publishAlertOpened\(\{ viewerUid: uid, peerUid, record \}\)/);
    assert.match(hook, /subscribeAlertOpened\(/);
    assert.match(hook, /mergeSeenMaps\(loadedSeen, localSeenFor\(uid\)\)/);
    assert.match(hook, /takeResolvedPushOpens\(uid, mapped, Date\.now\(\)\)/);
    assert.match(hook, /firebaseAuth\.currentUser\?\.uid !== uid/);
    const app = read('App.tsx');
    assert.match(app, /notePushAlertOpened\(viewerUid, actorUid, openedAt\)/);
    const tabs = read('navigation/RootTabs.tsx');
    assert.match(tabs, /const \{ unseenCount \} = useNearbyAlerts\(\)/);
  });
});

describe('alertSeen write (rules require appearanceKey)', () => {
  it('iOS store never writes a record without appearanceKey', () => {
    const store = read('alerts/alertSeenStore.ios.ts');
    const body = store.slice(store.indexOf('export async function writeAlertSeen'));
    assert.ok(body.indexOf('if (!record.appearanceKey) return;') < body.indexOf('await setDoc('));
    assert.ok(body.indexOf('if (!record.appearanceKey) return;') > 0);
  });
});
