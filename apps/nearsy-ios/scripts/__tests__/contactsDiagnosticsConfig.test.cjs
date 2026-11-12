const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  CONTACTS_DIAGNOSTICS_PROFILE,
  CONTACTS_DIAGNOSTICS_UNTIL_EXTRA,
  resolveContactsDiagnosticsUntil,
} = require('../contactsDiagnosticsConfig.cjs');
const { assertAnalyticsBuildConfig } = require('../analyticsBuildConfig.cjs');

const appRoot = path.join(__dirname, '../..');
const eas = JSON.parse(fs.readFileSync(path.join(appRoot, 'eas.json'), 'utf8'));
const appConfig = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
const NOW = Date.parse('2026-11-10T21:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const diag = eas.build[CONTACTS_DIAGNOSTICS_PROFILE];
const onBuilder = (env) => ({ ...env, EAS_BUILD: 'true', EAS_BUILD_PROFILE: CONTACTS_DIAGNOSTICS_PROFILE });

describe('Contacts diagnostic build gate', () => {
  it('the internal profile embeds an expiry seven days after the build', () => {
    const until = resolveContactsDiagnosticsUntil(onBuilder(diag.env), NOW);
    assert.equal(until, new Date(NOW + 7 * DAY).toISOString());
  });

  it('the local CLI read before the build embeds nothing', () => {
    assert.equal(resolveContactsDiagnosticsUntil({ ...diag.env }, NOW), undefined);
  });

  it('every other profile is off, including the public one', () => {
    for (const [name, profile] of Object.entries(eas.build)) {
      if (name === CONTACTS_DIAGNOSTICS_PROFILE) continue;
      const env = { ...(profile.env ?? {}), EAS_BUILD: 'true', EAS_BUILD_PROFILE: name };
      assert.equal(resolveContactsDiagnosticsUntil(env, NOW), undefined, name);
    }
  });

  it('declaring it outside the internal profile fails the build', () => {
    assert.throws(
      () =>
        resolveContactsDiagnosticsUntil(
          { ...diag.env, EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production' },
          NOW,
        ),
      /only allowed/,
    );
    assert.throws(
      () => resolveContactsDiagnosticsUntil({ NEARSY_CONTACTS_DIAGNOSTICS_DAYS: '7' }, NOW),
      /only allowed/,
    );
  });

  it('the window is a whole number of days, at most seven', () => {
    for (const days of ['0', '8', '30', '7.5', 'x']) {
      assert.throws(
        () => resolveContactsDiagnosticsUntil(onBuilder({ ...diag.env, NEARSY_CONTACTS_DIAGNOSTICS_DAYS: days }), NOW),
        /from 1 to 7/,
        days,
      );
    }
  });

  it('keeps PostHog off, Firebase production and the public profile underneath', () => {
    assert.equal(diag.extends, 'production');
    assert.equal(diag.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV, 'production');
    // 2.1.0: production captures, so this profile (which extends it) may only
    // switch PostHog off explicitly, with empty values.
    for (const key of Object.keys(diag.env)) {
      if (key.startsWith('EXPO_PUBLIC_POSTHOG_')) assert.equal(diag.env[key], '', key);
    }
    assert.deepEqual(
      assertAnalyticsBuildConfig({
        ...eas.build.production.env,
        ...diag.env,
        EAS_BUILD: 'true',
        EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_fake_token_for_tests',
      }),
      { declared: false },
    );
    for (const key of Object.keys(eas.build.production.env)) {
      assert.equal(key.startsWith('NEARSY_CONTACTS_DIAGNOSTICS'), false, key);
    }
  });

  it('app.config puts it in extra only for production-environment builds', () => {
    assert.match(appConfig, /resolveContactsDiagnosticsUntil\(process\.env\)/);
    assert.match(appConfig, /extraBase\[CONTACTS_DIAGNOSTICS_UNTIL_EXTRA\] = contactsDiagnosticsUntil/);
    assert.equal(CONTACTS_DIAGNOSTICS_UNTIL_EXTRA, 'NEARSY_CONTACTS_DIAGNOSTICS_UNTIL');
  });
});
