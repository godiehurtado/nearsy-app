const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  CONTACTS_DIAGNOSTICS_PROFILE: PROFILE,
  CONTACTS_DIAGNOSTICS_PROFILE_ENV: PROFILE_ENV,
  CONTACTS_DIAGNOSTICS_UNTIL_ENV: UNTIL_ENV,
  resolveContactsDiagnosticsUntil: resolve,
} = require('../contactsDiagnosticsConfig.cjs');

const NOW = Date.parse('2026-11-05T12:00:00Z');
const MIAMI_END = '2026-11-13T04:59:00.000Z';
const valid = { [UNTIL_ENV]: MIAMI_END, [PROFILE_ENV]: PROFILE, EAS_BUILD_PROFILE: PROFILE };

describe('Contacts diagnostics build gate', () => {
  it('is off by default', () => {
    assert.equal(resolve({}, NOW), undefined);
    assert.equal(resolve({ [UNTIL_ENV]: '  ' }, NOW), undefined);
    assert.equal(resolve({ [UNTIL_ENV]: '', [PROFILE_ENV]: PROFILE }, NOW), undefined);
  });

  it('accepts a near instant in the dedicated profile', () => {
    assert.equal(resolve(valid, NOW), MIAMI_END);
  });

  it('fails the build for a date outside that profile', () => {
    assert.throws(() => resolve({ [UNTIL_ENV]: MIAMI_END }, NOW), /only allowed/);
    assert.throws(
      () => resolve({ ...valid, EAS_BUILD_PROFILE: 'production' }, NOW),
      /only allowed/,
    );
  });

  it('fails the build for a bad, past or distant date', () => {
    for (const until of [
      'true',
      '2026-11-12',
      '2026-11-04T00:00:00.000Z',
      '2026-11-30T00:00:00.000Z',
      '2026-13-99T00:00:00.000Z',
      '2026-11-12T23:59:00.000-05:00',
    ]) {
      assert.throws(() => resolve({ ...valid, [UNTIL_ENV]: until }, NOW), /must be/);
    }
  });

  it('only the diagnostics profile carries it', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '../../eas.json'), 'utf8'));
    for (const [name, profile] of Object.entries(eas.build)) {
      if (name === PROFILE) continue;
      assert.equal(profile.env?.[UNTIL_ENV], undefined, name);
      assert.equal(profile.env?.[PROFILE_ENV], undefined, name);
    }
    assert.equal(eas.build[PROFILE].extends, 'production');
    assert.equal(eas.build[PROFILE].env[UNTIL_ENV], MIAMI_END);
    assert.equal(eas.build[PROFILE].env[PROFILE_ENV], PROFILE);
    // 23:59 in Miami on November 12, 2026 (UTC-5 after the November 1 change).
    assert.equal(Date.parse(MIAMI_END), Date.parse('2026-11-12T23:59:00.000-05:00'));
    assert.equal(eas.submit.production.ios, undefined);
    assert.equal(eas.submit[PROFILE].ios.ascAppId, '6759302206');
  });
});
