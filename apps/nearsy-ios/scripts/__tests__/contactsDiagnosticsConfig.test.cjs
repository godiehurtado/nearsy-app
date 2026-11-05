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
const valid = { [UNTIL_ENV]: '2026-11-12', [PROFILE_ENV]: PROFILE, EAS_BUILD_PROFILE: PROFILE };

describe('Contacts diagnostics build gate', () => {
  it('is off by default', () => {
    assert.equal(resolve({}, NOW), undefined);
    assert.equal(resolve({ [UNTIL_ENV]: '  ' }, NOW), undefined);
    assert.equal(resolve({ [UNTIL_ENV]: '', [PROFILE_ENV]: PROFILE }, NOW), undefined);
  });

  it('accepts a near date in the dedicated profile', () => {
    assert.equal(resolve(valid, NOW), '2026-11-12');
  });

  it('fails the build for a date outside that profile', () => {
    assert.throws(() => resolve({ [UNTIL_ENV]: '2026-11-12' }, NOW), /only allowed/);
    assert.throws(
      () => resolve({ ...valid, EAS_BUILD_PROFILE: 'production' }, NOW),
      /only allowed/,
    );
  });

  it('fails the build for a bad, past or distant date', () => {
    for (const until of ['true', '2026-11-04', '2026-11-30', '2026-13-99']) {
      assert.throws(() => resolve({ ...valid, [UNTIL_ENV]: until }, NOW), /must be/);
    }
  });

  it('the committed profiles keep it off', () => {
    const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '../../eas.json'), 'utf8'));
    for (const [name, profile] of Object.entries(eas.build)) {
      if (name === PROFILE) continue;
      assert.equal(profile.env?.[UNTIL_ENV], undefined, name);
      assert.equal(profile.env?.[PROFILE_ENV], undefined, name);
    }
    assert.equal(eas.build[PROFILE].extends, 'production');
    assert.equal(eas.build[PROFILE].env[UNTIL_ENV], '');
  });
});
