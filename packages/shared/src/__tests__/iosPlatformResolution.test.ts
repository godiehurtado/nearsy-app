/**
 * Root cause of the iOS Contacts failure (builds 75 and 76): on iOS, Metro
 * resolves './reevaluatePendingStore' to reevaluatePendingStore.ios.ts, which
 * imported itself and did not export getReevaluatePendingStore. The pending
 * port then threw a synchronous TypeError inside identityCall, before any
 * Identity request, and the controller returned contacts-invalid-response:
 * "Ref: unknown/contacts-invalid-response/k-none/after-session_read".
 *
 * Node tests resolve the plain .ts files, so they never saw it. These tests
 * use iOS resolution (.ios.* first) and Metro's Babel transform.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures/iosResolution');
const sharedSrc = resolve(here, '..');

describe('iOS platform variants', () => {
  it('every extensionless import that resolves to a .ios file finds its names, and no .ios file imports itself', () => {
    const out = execFileSync(process.execPath, [join(fixtures, 'iosVariantAudit.cjs'), sharedSrc], {
      encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(out), []);
  });
});

describe('Contacts enable flow under iOS resolution and Metro transform', () => {
  it('registers the pending store, reaches Identity and succeeds', () => {
    const out = execFileSync(process.execPath, [join(fixtures, 'iosEnableFlow.cjs')], {
      encoding: 'utf8',
      timeout: 240_000,
    });
    assert.match(out, /store registration: ok/);
    assert.match(out, /isPending: ok/);
    assert.match(out, /reevaluateProximityNotices\.ts imports \.\/reevaluatePendingStore -> reevaluatePendingStore\.ios\.ts/);
    assert.match(out, /outcome: \{"ok":true\}/);
    assert.match(out, /identity calls: 3/);
    assert.doesNotMatch(out, /contacts-invalid-response/);
  });
});
