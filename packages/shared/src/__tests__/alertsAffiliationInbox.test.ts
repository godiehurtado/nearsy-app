/**
 * Alerts inbox with the additive discoverNearby field sharedAffiliationCount
 * (server-computed stable affiliation identities shared between active modes).
 * Synthetic responses until Functions deploys the field.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { mapDiscoverResultsToAlerts } from '../hooks/nearbyAlertsMapping';
import es from '../i18n/locales/es';
import enNotifications from '../i18n/resources/notifications';
import { buildAlertRowMessage } from '../screens/alertsPresentation';
import { parseDiscoverNearbyResponse } from '../visibility/callables/parse';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, '..', path), 'utf8');

const VIEWER = 'viewer';
const MINE = new Set(['sports_outdoors_soccer']);

function result(uid: string, opts: { interests?: string[]; affiliations?: unknown } = {}) {
  return {
    uid,
    distanceMeters: 12,
    profile: {
      mode: 'personal',
      displayName: `Name ${uid}`,
      profileImage: null,
      occupation: 'Designer',
      interestIds: opts.interests ?? [],
    },
    ...('affiliations' in opts ? { sharedAffiliationCount: opts.affiliations } : {}),
  };
}

function inbox(results: unknown[]) {
  const response = parseDiscoverNearbyResponse({
    contractVersion: 1,
    results,
    nextCursor: null,
    serverTime: 1000,
  });
  return mapDiscoverResultsToAlerts(response.results, MINE, 1000, VIEWER, (m) => m * 3.28084);
}

const lookup = (root: any) =>
  ((key: string, opts?: Record<string, unknown>) => {
    let cur: any = root;
    for (const part of key.split('.')) cur = cur?.[part];
    if (typeof cur !== 'string') return key;
    return cur.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(opts?.[k] ?? ''));
  }) as any;
const tEn = lookup({ notifications: enNotifications });
const tEs = lookup(es);
const translateItem = ((id: string) => id) as any;

describe('sharedAffiliationCount parsing', () => {
  it('keeps only non-negative integers and never fails the response', () => {
    const response = parseDiscoverNearbyResponse({
      contractVersion: 1,
      nextCursor: null,
      serverTime: 1,
      results: [
        result('a', { affiliations: 2 }),
        result('b', { affiliations: 0 }),
        result('c', { affiliations: -1 }),
        result('d', { affiliations: 1.5 }),
        result('e', { affiliations: '3' }),
        result('f', { affiliations: null }),
        result('g', { affiliations: Number.NaN }),
        result('h'),
      ],
    });
    assert.deepEqual(
      response.results.map((r) => r.sharedAffiliationCount),
      [2, 0, undefined, undefined, undefined, undefined, undefined, undefined],
    );
  });
});

describe('Alerts inbox', () => {
  it('affiliation only: shown, with the generic affiliation text', () => {
    const [row, ...rest] = inbox([result('p', { affiliations: 1 })]);
    assert.equal(rest.length, 0);
    assert.equal(row.kind, 'affiliation_nearby');
    assert.equal(row.sharedAffiliations, true);
    assert.equal(buildAlertRowMessage(row, tEn, translateItem), 'Name p is near you and you share affiliations.');
    assert.equal(buildAlertRowMessage(row, tEs, translateItem), 'Name p está cerca y comparte afiliaciones contigo.');
  });

  it('interest only: shown with the interests text', () => {
    const [row] = inbox([result('p', { interests: ['sports_outdoors_soccer'], affiliations: 0 })]);
    assert.equal(row.kind, 'interest_nearby');
    assert.equal(row.sharedAffiliations, undefined);
    assert.match(buildAlertRowMessage(row, tEn, translateItem), /share interests/);
  });

  it('both: one row, and the affiliation text wins', () => {
    const rows = inbox([result('p', { interests: ['sports_outdoors_soccer'], affiliations: 3 })]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'affiliation_nearby');
    assert.equal(buildAlertRowMessage(rows[0], tEn, translateItem), 'Name p is near you and you share affiliations.');
  });

  it('none, absent or invalid field: not shown', () => {
    assert.deepEqual(inbox([result('none', { affiliations: 0 })]), []);
    assert.deepEqual(inbox([result('absent')]), []);
    for (const bad of [-1, 1.5, '2', null, Number.NaN]) {
      assert.deepEqual(inbox([result('bad', { affiliations: bad })]), [], String(bad));
    }
  });

  it('one row per uid even if a result repeats, and never the viewer', () => {
    const rows = mapDiscoverResultsToAlerts(
      [
        { ...(result('p', { affiliations: 1 }) as any) },
        { ...(result('p', { interests: ['sports_outdoors_soccer'] }) as any) },
        { ...(result(VIEWER, { affiliations: 5 }) as any) },
      ],
      MINE,
      1000,
      VIEWER,
      (m) => m,
    );
    assert.deepEqual(rows.map((r) => r.uid), ['p']);
  });

  it('the text never names affiliations or shows logos', () => {
    for (const text of [enNotifications.messages.affiliationNearby, (es as any).notifications.messages.affiliationNearby]) {
      assert.deepEqual(text.match(/\{\{(\w+)\}\}/g), ['{{name}}']);
    }
  });

  it('no extra calls per profile and no push preference in the inbox', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.equal(hook.match(/client\.discoverNearby\(/g)?.length, 1);
    assert.equal(/getDiscoveryProfile|notifyNearbyInterests|contactsSync/.test(hook), false);
    const mapping = read('hooks/nearbyAlertsMapping.ts');
    assert.equal(/firebase|fetch\(|await /.test(mapping), false);
  });
});
