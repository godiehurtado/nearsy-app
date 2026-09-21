/**
 * Home reinstall recovery — full education, no prep, stable focus deps.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  shouldForceFullBackgroundEducation,
  isVisibilityToggleDisabled,
} from '../homeLocationRecovery.ts';
import {
  hasSeenBackgroundLocationEducation,
  markBackgroundLocationEducationSeen,
} from '../backgroundEducationStorage.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

describe('homeLocationRecovery decisions', () => {
  it('forces full education when local mark absent', () => {
    assert.equal(
      shouldForceFullBackgroundEducation({
        localEducationSeen: false,
        recoveryNeeded: true,
      }),
      true,
    );
    assert.equal(
      shouldForceFullBackgroundEducation({
        localEducationSeen: true,
        recoveryNeeded: true,
      }),
      false,
    );
  });

  it('Visibility toggle disabled only for hydration/mutation', () => {
    assert.equal(
      isVisibilityToggleDisabled({ hydrating: true, mutating: false }),
      true,
    );
    assert.equal(
      isVisibilityToggleDisabled({ hydrating: false, mutating: true }),
      true,
    );
    assert.equal(
      isVisibilityToggleDisabled({ hydrating: false, mutating: false }),
      false,
    );
  });

  it('education mark is local-only', async () => {
    const mem = new Map<string, string>();
    const storage = {
      async getItem(key: string) {
        return mem.has(key) ? mem.get(key)! : null;
      },
      async setItem(key: string, value: string) {
        mem.set(key, value);
      },
    };
    assert.equal(await hasSeenBackgroundLocationEducation(storage), false);
    await markBackgroundLocationEducationSeen(storage);
    assert.equal(await hasSeenBackgroundLocationEducation(storage), true);
  });
});

describe('Home reinstall source contracts', () => {
  it('offers full education without preparation; focus deps avoid visibility churn', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /offerBackgroundEducationIfNeeded/);
    assert.match(home, /forceFull:\s*true/);
    assert.match(home, /shouldForceFullBackgroundEducation/);
    assert.doesNotMatch(home, /LocationPreparationModal/);
    assert.doesNotMatch(home, /setLocationPreparing\(true\)/);
    assert.doesNotMatch(
      home,
      /}, \[profile\.visibility, profile\.bgVisible, loading\]\)/,
    );
    const focus = home.slice(
      home.indexOf('useFocusEffect('),
      home.indexOf('const showVisibilityError'),
    );
    assert.match(focus, /\[loading,/);
  });

  it('App never starts from bgVisible alone; marks recovery when education absent', () => {
    const app = readShared('App.tsx');
    assert.match(app, /hasSeenBackgroundLocationEducation/);
    assert.match(app, /markPostLoginLocationRecoveryNeeded/);
    assert.doesNotMatch(
      app,
      /if \(bgVisible\) \{\s*await startBackgroundLocation/,
    );
    assert.match(app, /visibility && bgVisible && fgOk && bgOk/);
  });

  it('disclosure modal unmounts when not visible', () => {
    const modal = readShared('components/BackgroundLocationDisclosureModal.tsx');
    assert.match(modal, /if \(!visible\) return null/);
  });
});
