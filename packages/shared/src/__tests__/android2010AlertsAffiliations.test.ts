/**
 * Alerts inbox with Functions `sharedAffiliationCount` (additive on discoverNearby).
 * Synthetic responses through the real parser, mapping and row copy.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

// parse.ts uses extensionless relative imports, which only Metro resolves.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const { parseDiscoverNearbyResponse } = await import('../visibility/callables/parse.ts');
const { mapDiscoverResultsToInterestAlerts } = await import('../hooks/nearbyAlertsMapping.ts');
const { buildAlertRowMessage } = await import('../screens/alertsPresentation.ts');
const { default: notificationsEn } = await import('../i18n/resources/notifications.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const VIEWER = 'viewer';
const MY_INTERESTS = new Set(['music', 'hiking']);

function profile(interestIds: string[]) {
  return {
    mode: 'personal',
    displayName: 'Ana',
    profileImage: null,
    occupation: '',
    interestIds,
  };
}

function inbox(rows: Array<Record<string, unknown>>) {
  const response = parseDiscoverNearbyResponse({
    contractVersion: 1,
    results: rows.map((row, i) => ({ uid: `peer${i}`, distanceMeters: 5, ...row })),
    nextCursor: null,
    serverTime: 1000,
  });
  return {
    response,
    alerts: mapDiscoverResultsToInterestAlerts(response.results, MY_INTERESTS, 1000, VIEWER),
  };
}

const t = (key: string, options?: Record<string, unknown>) =>
  `${key}${options ? JSON.stringify(options) : ''}`;
const translateItem = (_key: string, fallback: string) => fallback;

describe('Alerts inbox: shared affiliations', () => {
  it('affiliation only: one row, with the generic affiliation copy', () => {
    const { alerts } = inbox([{ profile: profile(['chess']), sharedAffiliationCount: 2 }]);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].sharesAffiliation, true);
    assert.deepEqual(alerts[0].sharedInterests, []);
    assert.equal(
      buildAlertRowMessage(alerts[0], t, translateItem),
      'notifications.messages.affiliationNearby{"name":"Ana"}',
    );
  });

  it('interest only: unchanged row and copy', () => {
    const { alerts } = inbox([{ profile: profile(['music']), sharedAffiliationCount: 0 }]);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].sharesAffiliation, undefined);
    assert.match(buildAlertRowMessage(alerts[0], t, translateItem), /^notifications\.messages\.interestNearby/);
  });

  it('both: one row, affiliation copy first, no affiliation names or logos', () => {
    const { alerts } = inbox([{ profile: profile(['music', 'hiking']), sharedAffiliationCount: 1 }]);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].sharesAffiliation, true);
    const message = buildAlertRowMessage(alerts[0], t, translateItem);
    assert.equal(message, 'notifications.messages.affiliationNearby{"name":"Ana"}');
    assert.doesNotMatch(JSON.stringify(alerts[0]), /logo|affiliationName|affiliations/);
  });

  it('neither: no row', () => {
    const { alerts } = inbox([{ profile: profile(['chess']), sharedAffiliationCount: 0 }]);
    assert.deepEqual(alerts, []);
  });

  it('field absent: no affiliation match (older backend)', () => {
    const { response, alerts } = inbox([
      { profile: profile(['chess']) },
      { profile: profile(['music']) },
    ]);
    assert.equal('sharedAffiliationCount' in response.results[0], false);
    assert.deepEqual(alerts.map((a) => a.uid), ['peer1']);
    assert.equal(alerts[0].sharesAffiliation, undefined);
  });

  it('field invalid: dropped by the parser, never a match, never an error', () => {
    const invalid = [-1, 1.5, '2', true, null, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60, {}];
    const { response, alerts } = inbox(
      invalid.map((sharedAffiliationCount) => ({ profile: profile(['chess']), sharedAffiliationCount })),
    );
    for (const result of response.results) {
      assert.equal('sharedAffiliationCount' in result, false);
    }
    assert.deepEqual(alerts, []);
  });

  it('one row per uid even if a result repeats', () => {
    const results = [
      { uid: 'p', distanceMeters: 1, profile: profile(['music']), sharedAffiliationCount: 1 },
      { uid: 'p', distanceMeters: 2, profile: profile(['hiking']) },
    ] as never;
    const alerts = mapDiscoverResultsToInterestAlerts(results, MY_INTERESTS, 1, VIEWER);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].sharesAffiliation, true);
  });

  it('the viewer never appears, whatever the count', () => {
    const results = [
      { uid: VIEWER, distanceMeters: 1, profile: profile(['music']), sharedAffiliationCount: 3 },
    ] as never;
    assert.deepEqual(mapDiscoverResultsToInterestAlerts(results, MY_INTERESTS, 1, VIEWER), []);
  });
});

describe('Alerts inbox: copy, navigation and instrumentation', () => {
  it('EN and ES copy exist and keep the current style', () => {
    assert.equal(
      notificationsEn.messages.affiliationNearby,
      '{{name}} is near you and you share an affiliation.',
    );
    const es = src('i18n/locales/es.ts');
    assert.ok(es.includes("affiliationNearby: '{{name}} está cerca y compartís una afiliación.'"));
    assert.ok(es.includes("affiliationNearby: 'Afiliación compartida cercana'"));
  });

  it('a tap still opens DiscoveryProfile and reports alert_opened from the inbox', () => {
    const screen = src('screens/AlertsScreen.tsx');
    assert.ok(screen.includes("trackAlertOpened('inbox')"));
    assert.ok(/navigation\.navigate\('Home',/.test(screen));
  });

  it('the inbox stays off the push preference and adds no Contacts', () => {
    const hook = src('hooks/useNearbyAlerts.ts');
    assert.doesNotMatch(hook, /notifyNearbyInterests|contactsSync|fromContacts/);
    const mapping = src('hooks/nearbyAlertsMapping.ts');
    assert.doesNotMatch(mapping, /contact/i);
  });
});
