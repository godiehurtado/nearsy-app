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
import {
  buildAlertAccessibilityLabel,
  buildAlertAffiliationDetail,
  buildAlertRowMessage,
} from '../screens/alertsPresentation';
import {
  SHARED_AFFILIATION_NAMES_MAX,
  SHARED_AFFILIATION_NAME_MAX_CHARS,
  parseDiscoverNearbyResponse,
  parseSharedAffiliationNames,
} from '../visibility/callables/parse';

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

  it('the main sentence only names the person; the affiliation goes on its own line', () => {
    for (const messages of [enNotifications.messages, (es as any).notifications.messages]) {
      assert.deepEqual(messages.affiliationNearby.match(/\{\{(\w+)\}\}/g), ['{{name}}']);
      assert.deepEqual(messages.affiliationNearbyOne.match(/\{\{(\w+)\}\}/g), ['{{name}}']);
      assert.deepEqual(messages.affiliationMore.match(/\{\{(\w+)\}\}/g), ['{{count}}']);
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

function named(uid: string, names: unknown, opts: { count?: unknown; interests?: string[] } = {}) {
  return {
    ...result(uid, { interests: opts.interests, ...('count' in opts ? { affiliations: opts.count } : {}) }),
    sharedAffiliationNames: names,
  };
}

describe('sharedAffiliationNames (optional, server-resolved)', () => {
  it('parses defensively: trims, strips bidi and controls, drops bad entries, dedupes, caps', () => {
    assert.deepEqual(
      parseSharedAffiliationNames([
        '  Miami  Dade College ',
        '‮MDC Alumni‬',
        'miami dade college',
        '',
        '   ',
        42,
        null,
        'Line\nbreak',
        'x'.repeat(SHARED_AFFILIATION_NAME_MAX_CHARS + 1),
        'x'.repeat(SHARED_AFFILIATION_NAME_MAX_CHARS),
      ]),
      ['Miami Dade College', 'MDC Alumni', 'Line break', 'x'.repeat(SHARED_AFFILIATION_NAME_MAX_CHARS)],
    );
    // ZWJ sequences survive.
    assert.deepEqual(parseSharedAffiliationNames(['Club 👩‍💻']), ['Club 👩‍💻']);
    const many = Array.from({ length: 25 }, (_, i) => `Org ${i}`);
    assert.equal(parseSharedAffiliationNames(many)?.length, SHARED_AFFILIATION_NAMES_MAX);
    for (const bad of [undefined, null, 'Org', {}, 3, [], ['', 7, null]]) {
      assert.equal(parseSharedAffiliationNames(bad), undefined, JSON.stringify(bad));
    }
  });

  it('an invalid field never fails the response or the rest of the result', () => {
    const [row] = parseDiscoverNearbyResponse({
      contractVersion: 1,
      nextCursor: null,
      serverTime: 1,
      results: [named('p', 'not-an-array', { count: 2 })],
    }).results;
    assert.equal(row.uid, 'p');
    assert.equal(row.sharedAffiliationCount, 2);
    assert.equal('sharedAffiliationNames' in row, false);
  });

  it('one name: singular sentence plus the name line, EN and ES', () => {
    const [row] = inbox([named('p', ['Miami Dade College'], { count: 1 })]);
    assert.equal(row.kind, 'affiliation_nearby');
    assert.deepEqual(row.sharedAffiliationNames, ['Miami Dade College']);
    assert.equal(buildAlertRowMessage(row, tEn, translateItem), 'Name p is near you and you share an affiliation.');
    assert.equal(buildAlertRowMessage(row, tEs, translateItem), 'Name p está cerca y comparte una afiliación contigo.');
    assert.deepEqual(buildAlertAffiliationDetail(row, tEn), { name: 'Miami Dade College' });
    assert.equal(
      buildAlertAccessibilityLabel(buildAlertRowMessage(row, tEn, translateItem), buildAlertAffiliationDetail(row, tEn)),
      'Name p is near you and you share an affiliation. Miami Dade College',
    );
  });

  it('more shared than names: "and N more" uses the larger of count and names', () => {
    const [row] = inbox([named('p', ['Miami Dade College'], { count: 3 })]);
    assert.equal(buildAlertRowMessage(row, tEn, translateItem), 'Name p is near you and you share affiliations.');
    assert.deepEqual(buildAlertAffiliationDetail(row, tEn), { name: 'Miami Dade College', more: 'and 2 more' });
    assert.deepEqual(buildAlertAffiliationDetail(row, tEs), { name: 'Miami Dade College', more: 'y 2 más' });
    const [noCount] = inbox([named('q', ['A', 'B'])]);
    assert.deepEqual(buildAlertAffiliationDetail(noCount, tEn), { name: 'A', more: 'and 1 more' });
  });

  it('names win over interests, one row per uid', () => {
    const rows = inbox([named('p', ['Miami Dade College'], { count: 1, interests: ['sports_outdoors_soccer'] })]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'affiliation_nearby');
    assert.doesNotMatch(buildAlertRowMessage(rows[0], tEn, translateItem), /interests/);
  });

  it('names alone are enough to show the row (count absent or zero)', () => {
    assert.equal(inbox([named('p', ['A'])])[0]?.kind, 'affiliation_nearby');
    assert.equal(inbox([named('p', ['A'], { count: 0 })])[0]?.kind, 'affiliation_nearby');
  });

  it('missing or invalid names: generic text, no detail line (older servers)', () => {
    for (const names of [undefined, null, [], ['  '], 'A', [1, 2]]) {
      const [row] = inbox([named('p', names, { count: 2 })]);
      assert.equal(buildAlertRowMessage(row, tEn, translateItem), 'Name p is near you and you share affiliations.');
      assert.equal(buildAlertAffiliationDetail(row, tEn), null, JSON.stringify(names));
      assert.equal(row.sharedAffiliationNames, undefined);
    }
  });

  it('long names shrink to one line while "and N more" stays whole', () => {
    const screen = read('screens/AlertsScreen.tsx');
    assert.match(screen, /styles\.affiliationName[\s\S]{0,120}numberOfLines=\{1\}/);
    assert.match(screen, /affiliationName: \{\s*flexShrink: 1,/);
    assert.match(screen, /affiliationMore: \{\s*flexShrink: 0,/);
    assert.match(screen, /accessibilityLabel=\{buildAlertAccessibilityLabel\(message, affiliation\)\}/);
  });

  it('never matches affiliations by text or fetches per profile', () => {
    const mapping = read('hooks/nearbyAlertsMapping.ts');
    assert.equal(/affiliations\b.*\.(includes|indexOf|match)\(|toLowerCase|localeCompare/.test(mapping), false);
    const presentation = read('screens/alertsPresentation.ts');
    assert.equal(/firebase|fetch\(|await /.test(presentation), false);
  });
});
