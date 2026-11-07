const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { resolveIosBinaryVersionOverride } = require('../iosBinaryVersionOverride.cjs');

const appRoot = path.join(__dirname, '../..');
const eas = JSON.parse(fs.readFileSync(path.join(appRoot, 'eas.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8'));
const appConfig = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');

describe('iOS binary version override', () => {
  it('unset keeps app.json', () => {
    assert.deepEqual(resolveIosBinaryVersionOverride({}), {});
    assert.deepEqual(
      resolveIosBinaryVersionOverride({ NEARSY_IOS_VERSION: ' ', NEARSY_IOS_BUILD_NUMBER: '' }),
      {},
    );
  });

  it('accepts a marketing version and a build number', () => {
    assert.deepEqual(
      resolveIosBinaryVersionOverride({ NEARSY_IOS_VERSION: '2.0.10', NEARSY_IOS_BUILD_NUMBER: '73' }),
      { version: '2.0.10', buildNumber: '73' },
    );
  });

  it('rejects malformed values instead of building a wrong binary', () => {
    for (const env of [
      { NEARSY_IOS_VERSION: '2.0' },
      { NEARSY_IOS_VERSION: 'v2.0.10' },
      { NEARSY_IOS_BUILD_NUMBER: '0' },
      { NEARSY_IOS_BUILD_NUMBER: '73.1' },
      { NEARSY_IOS_BUILD_NUMBER: '-73' },
    ]) {
      assert.throws(() => resolveIosBinaryVersionOverride(env), /\[app\.config\]/, JSON.stringify(env));
    }
  });

  it('app.config applies it to the iOS config only', () => {
    assert.match(appConfig, /resolveIosBinaryVersionOverride\(process\.env\)/);
    assert.match(appConfig, /\.\.\.\(binaryOverride\.version \? \{ version: binaryOverride\.version \} : \{\}\)/);
    assert.match(appConfig, /\.\.\.\(binaryOverride\.buildNumber \? \{ buildNumber: binaryOverride\.buildNumber \} : \{\}\)/);
  });

  it('only the beta profile numbers itself; app.json and other profiles are untouched', () => {
    assert.equal(eas.cli.appVersionSource, 'local');
    assert.equal(appJson.expo.version, '2.0.9');
    assert.equal(appJson.expo.ios.buildNumber, '70');
    assert.equal(eas.build.beta.env.NEARSY_IOS_VERSION, '2.0.10');
    assert.equal(eas.build.beta.env.NEARSY_IOS_BUILD_NUMBER, '73');
    for (const [name, profile] of Object.entries(eas.build)) {
      if (name === 'beta') continue;
      const env = profile.env ?? {};
      assert.equal('NEARSY_IOS_VERSION' in env, false, name);
      assert.equal('NEARSY_IOS_BUILD_NUMBER' in env, false, name);
    }
  });
});
