/**
 * Alerts inbox with Functions `sharedAffiliationNames` (additive, display only,
 * next to sharedAffiliationCount). Synthetic responses through the real parser,
 * mapping and row copy.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// parse.ts and es.ts use extensionless relative imports, which only Metro resolves.
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
const { buildAlertRowMessage, shortenAffiliationName, ALERT_AFFILIATION_NAME_MAX } = await import(
  '../screens/alertsPresentation.ts'
);
const { default: notificationsEn } = await import('../i18n/resources/notifications.ts');
const { es } = await import('../i18n/locales/es.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VIEWER = 'viewer';
const MY_INTERESTS = new Set(['music']);

const profile = (interestIds: string[]) => ({
  mode: 'personal',
  displayName: 'Ana',
  profileImage: null,
  occupation: '',
  interestIds,
});

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
const row = (alert: Parameters<typeof buildAlertRowMessage>[0]) => buildAlertRowMessage(alert, t, translateItem);

describe('the field', () => {
  it('keeps trimmed, unique, valid strings, at most 3, only with a counted match', () => {
    const { response } = inbox([
      {
        profile: profile([]),
        sharedAffiliationCount: 5,
        sharedAffiliationNames: ['  Club Atlético ', 'club atlético', '', 7, null, 'Universidad', 'Colegio', 'Cuarto'],
      },
    ]);
    assert.deepEqual(response.results[0].sharedAffiliationNames, ['Club Atlético', 'Universidad', 'Colegio']);
  });

  it('drops names with zero-width format characters', () => {
    const { response } = inbox([
      {
        profile: profile([]),
        sharedAffiliationCount: 2,
        sharedAffiliationNames: [`Cl${String.fromCharCode(0x200b)}ub`, 'Club'],
      },
    ]);
    assert.deepEqual(response.results[0].sharedAffiliationNames, ['Club']);
  });

  it('drops names with control or bidi characters, or over 80 characters', () => {
    const { response } = inbox([
      {
        profile: profile([]),
        sharedAffiliationCount: 1,
        sharedAffiliationNames: ['Line\nbreak', `Evil${String.fromCharCode(0x202e)}eman`, 'x'.repeat(81), 'ü'.repeat(80)],
      },
    ]);
    assert.deepEqual(response.results[0].sharedAffiliationNames, ['ü'.repeat(80)]);
  });

  it('absent, invalid or empty after filtering: no field, never an error', () => {
    for (const names of [undefined, 'Club', {}, [], [42, '  ']]) {
      const { response } = inbox([
        { profile: profile([]), sharedAffiliationCount: 1, ...(names === undefined ? {} : { sharedAffiliationNames: names }) },
      ]);
      assert.equal('sharedAffiliationNames' in response.results[0], false);
    }
  });

  it('names never make a match: count 0 or absent ignores them', () => {
    const { response, alerts } = inbox([
      { profile: profile([]), sharedAffiliationCount: 0, sharedAffiliationNames: ['Club'] },
      { profile: profile([]), sharedAffiliationNames: ['Club'] },
      { profile: profile([]), sharedAffiliationCount: -1, sharedAffiliationNames: ['Club'] },
    ]);
    for (const result of response.results) assert.equal('sharedAffiliationNames' in result, false);
    assert.deepEqual(alerts, []);
  });
});

describe('the row', () => {
  it('one affiliation: its name, ahead of shared interests, one row per uid', () => {
    const { alerts } = inbox([
      { profile: profile(['music']), sharedAffiliationCount: 1, sharedAffiliationNames: ['Club Atlético'] },
    ]);
    assert.equal(alerts.length, 1);
    assert.equal(
      row(alerts[0]),
      'notifications.messages.affiliationNearbyNamed{"name":"Ana","affiliation":"Club Atlético"}',
    );
  });

  it('several: first name and how many more, from the count', () => {
    const { alerts } = inbox([
      { profile: profile([]), sharedAffiliationCount: 4, sharedAffiliationNames: ['Club', 'Universidad'] },
    ]);
    assert.equal(
      row(alerts[0]),
      'notifications.messages.affiliationNearbyNamedMore{"name":"Ana","affiliation":"Club","count":3}',
    );
  });

  it('no valid name: the generic affiliation copy, as before', () => {
    const { alerts } = inbox([{ profile: profile(['music']), sharedAffiliationCount: 2, sharedAffiliationNames: [''] }]);
    assert.equal(row(alerts[0]), 'notifications.messages.affiliationNearby{"name":"Ana"}');
  });

  it('a long name is cut with an ellipsis, by characters', () => {
    const long = `Asociación de Antiguos Alumnos ${'ñ'.repeat(40)}`;
    const short = shortenAffiliationName(long);
    assert.equal(Array.from(short).length, ALERT_AFFILIATION_NAME_MAX);
    assert.ok(short.endsWith('…'));
    assert.equal(shortenAffiliationName('Club'), 'Club');
    const emoji = shortenAffiliationName('🏀'.repeat(60));
    assert.equal(Array.from(emoji).length, ALERT_AFFILIATION_NAME_MAX);
    assert.doesNotMatch(emoji, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, 'no broken surrogate pair');
  });
});

describe('copy and privacy', () => {
  it('EN and ES have both sentences with the same placeholders', () => {
    const en = notificationsEn.messages;
    const esMessages = (es as { notifications: { messages: Record<string, string> } }).notifications.messages;
    for (const key of ['affiliationNearbyNamed', 'affiliationNearbyNamedMore'] as const) {
      const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
      assert.ok(en[key] && esMessages[key], key);
      assert.deepEqual(placeholders(esMessages[key]), placeholders(en[key]));
    }
    assert.equal(en.affiliationNearbyNamed, '{{name}} is near you and you share {{affiliation}}.');
    assert.equal(esMessages.affiliationNearbyNamed, '{{name}} está cerca y comparten {{affiliation}}.');
  });

  it('no analytics or log code reads the names, and no extra per-profile call exists', () => {
    const analyticsDir = path.join(root, 'analytics');
    for (const file of readdirSync(analyticsDir)) {
      if (!/\.tsx?$/.test(file)) continue;
      assert.doesNotMatch(readFileSync(path.join(analyticsDir, file), 'utf8'), /sharedAffiliationNames/, file);
    }
    const screen = readFileSync(path.join(root, 'screens/AlertsScreen.tsx'), 'utf8');
    assert.doesNotMatch(screen, /sharedAffiliationNames/);
    const hook = readFileSync(path.join(root, 'hooks/useNearbyAlerts.ts'), 'utf8');
    assert.doesNotMatch(hook, /getDiscoveryProfile|getProfileDetail|sharedAffiliationNames/);
    const mapping = readFileSync(path.join(root, 'hooks/nearbyAlertsMapping.ts'), 'utf8');
    assert.doesNotMatch(mapping, /console\./);
  });
});
