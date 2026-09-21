/**
 * Android CRJ Location step — local reducer (no shared Home coordinator).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createInitialCrjLocationStepState,
  reduceCrjLocationStep,
  isBackgroundImplicitWithForeground,
  canRequestBackgroundViaDialog,
  requiresBackgroundSettings,
} from '../crjLocationFlow.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

describe('crjLocationFlow reducer', () => {
  it('FG precise → Not now → bgVisible false → advance', () => {
    let s = createInitialCrjLocationStepState();
    s = reduceCrjLocationStep(s, { type: 'PRESS' });
    s = reduceCrjLocationStep(s, { type: 'FG_GRANTED' });
    assert.equal(s.educationVisible, true);
    s = reduceCrjLocationStep(s, { type: 'NOT_NOW' });
    assert.equal(s.bgVisible, false);
    assert.equal(s.advance, true);
    assert.equal(s.educationVisible, false);
  });

  it('API ≤28 Enable path grants via BG_GRANTED', () => {
    assert.equal(isBackgroundImplicitWithForeground(28), true);
    assert.equal(isBackgroundImplicitWithForeground(29), false);
    let s = createInitialCrjLocationStepState();
    s = reduceCrjLocationStep(s, { type: 'PRESS' });
    s = reduceCrjLocationStep(s, { type: 'FG_GRANTED' });
    s = reduceCrjLocationStep(s, { type: 'BG_REQUEST' });
    s = reduceCrjLocationStep(s, { type: 'BG_GRANTED' });
    assert.equal(s.bgVisible, true);
    assert.equal(s.advance, true);
  });

  it('API 29 Enable granted/denied', () => {
    assert.equal(canRequestBackgroundViaDialog(29), true);
    let granted = createInitialCrjLocationStepState();
    granted = reduceCrjLocationStep(granted, { type: 'PRESS' });
    granted = reduceCrjLocationStep(granted, { type: 'FG_GRANTED' });
    granted = reduceCrjLocationStep(granted, { type: 'BG_REQUEST' });
    granted = reduceCrjLocationStep(granted, { type: 'BG_GRANTED' });
    assert.equal(granted.bgVisible, true);

    let denied = createInitialCrjLocationStepState();
    denied = reduceCrjLocationStep(denied, { type: 'PRESS' });
    denied = reduceCrjLocationStep(denied, { type: 'FG_GRANTED' });
    denied = reduceCrjLocationStep(denied, { type: 'BG_REQUEST' });
    denied = reduceCrjLocationStep(denied, { type: 'BG_DENIED' });
    assert.equal(denied.bgVisible, false);
    assert.equal(denied.advance, true);
  });

  it('API 30+ Open Settings works after BG_REQUEST lock', () => {
    assert.equal(requiresBackgroundSettings(30), true);
    let ok = createInitialCrjLocationStepState();
    ok = reduceCrjLocationStep(ok, { type: 'PRESS' });
    ok = reduceCrjLocationStep(ok, { type: 'FG_GRANTED' });
    ok = reduceCrjLocationStep(ok, { type: 'BG_REQUEST' });
    assert.equal(ok.buttonLocked, true);
    ok = reduceCrjLocationStep(ok, { type: 'OPEN_SETTINGS' });
    assert.equal(ok.recovery, 'awaiting-settings');
    assert.equal(ok.educationVisible, false);
    ok = reduceCrjLocationStep(ok, { type: 'SETTINGS_RETURN_GRANTED' });
    assert.equal(ok.bgVisible, true);
    assert.equal(ok.advance, true);
  });

  it('approximate still reaches education; FG deny advances without education', () => {
    let approx = createInitialCrjLocationStepState();
    approx = reduceCrjLocationStep(approx, { type: 'PRESS' });
    approx = reduceCrjLocationStep(approx, { type: 'FG_APPROXIMATE' });
    assert.equal(approx.educationVisible, true);
    assert.equal(approx.recovery, 'approximate');

    let deny = createInitialCrjLocationStepState();
    deny = reduceCrjLocationStep(deny, { type: 'PRESS' });
    deny = reduceCrjLocationStep(deny, { type: 'FG_DENIED' });
    assert.equal(deny.educationVisible, false);
    assert.equal(deny.advance, true);
    assert.equal(deny.recovery, 'foreground-denied');
  });

  it('double-tap PRESS is ignored while active', () => {
    let s = createInitialCrjLocationStepState();
    const first = reduceCrjLocationStep(s, { type: 'PRESS' });
    const second = reduceCrjLocationStep(first, { type: 'PRESS' });
    assert.equal(second, first);
    assert.equal(first.foregroundRequestCount, 1);
  });

  it('throw/unmount clears locks without advance', () => {
    let s = createInitialCrjLocationStepState();
    s = reduceCrjLocationStep(s, { type: 'PRESS' });
    s = reduceCrjLocationStep(s, { type: 'FG_ERROR' });
    assert.equal(s.active, false);
    assert.equal(s.buttonLocked, false);
    assert.equal(s.advance, false);

    s = reduceCrjLocationStep(
      reduceCrjLocationStep(createInitialCrjLocationStepState(), {
        type: 'PRESS',
      }),
      { type: 'UNMOUNT' },
    );
    assert.equal(s.active, false);
    assert.equal(s.educationVisible, false);
  });

  it('CRJ screen has no preparation and no activate in Location step', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(src, /reduceCrjLocationStep/);
    assert.doesNotMatch(src, /LocationPreparationModal/);
    assert.doesNotMatch(src, /setLocationPreparing/);
    assert.doesNotMatch(src, /beginPostForegroundDisclosureJourney/);
    const request = src.slice(
      src.indexOf('async function requestLocation'),
      src.indexOf('async function finishCrjBackgroundDisclosure'),
    );
    assert.doesNotMatch(request, /activateVisibility|attemptInitialVisibility/);
  });
});
