/**
 * Smoke checks for start-dev-client network mode parsing (no EAS/network).
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.join(__dirname, '../start-dev-client.cjs');
const source = fs.readFileSync(scriptPath, 'utf8');

describe('start-dev-client LAN fallback', () => {
  it('supports --lan without hardcoding secrets', () => {
    assert.match(source, /parseNetworkMode/);
    assert.match(source, /argv\.includes\('--lan'\)/);
    assert.match(source, /networkFlag = networkMode === 'lan' \? '--lan' : '--tunnel'/);
    assert.match(source, /stripEmulatorVars/);
    assert.match(source, /printSafeRuntimeSummary/);
    assert.match(source, /nearsy-dev/);
    assert.doesNotMatch(source, /AIzaSy/);
    assert.doesNotMatch(source, /FIREBASE_APP_CHECK_DEBUG_TOKEN\s*=\s*['"][^'"]+['"]/);
  });

  it('refuses nearsy-pj and emulator for physical QA path', () => {
    assert.match(source, /must be nearsy-dev/);
    assert.match(source, /Emulator host is set/);
    assert.match(source, /functionsMode/);
  });
});
