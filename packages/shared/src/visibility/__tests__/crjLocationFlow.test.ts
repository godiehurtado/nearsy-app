/**
 * ENH-LOC-01 — CRJ Location step is a local sequence, not the shared journey.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInitialCrjLocationStepState,
  reduceCrjLocationStep,
  type CrjLocationStepState,
} from '../crjLocationFlow';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

function press(state = createInitialCrjLocationStepState()): CrjLocationStepState {
  return reduceCrjLocationStep(state, { type: 'PRESS' });
}

describe('CRJ location sequential flow', () => {
  it('FG granted → education visible and button unlocked', () => {
    const next = reduceCrjLocationStep(press(), { type: 'FG_GRANTED' });
    assert.equal(next.educationVisible, true);
    assert.equal(next.buttonLocked, false);
    assert.equal(next.advance, false);
    assert.equal(next.bgVisible, null);
  });

  it('FG granted → Not now → bgVisible false → advance', () => {
    const edu = reduceCrjLocationStep(press(), { type: 'FG_GRANTED' });
    const next = reduceCrjLocationStep(edu, { type: 'NOT_NOW' });
    assert.equal(next.bgVisible, false);
    assert.equal(next.educationVisible, false);
    assert.equal(next.advance, true);
    assert.equal(next.buttonLocked, false);
    const done = reduceCrjLocationStep(next, { type: 'ADVANCE_CONSUMED' });
    assert.equal(done.advance, false);
    assert.equal(done.active, false);
  });

  it('Enable → BG granted → bgVisible true → advance', () => {
    const edu = reduceCrjLocationStep(press(), { type: 'FG_GRANTED' });
    const asking = reduceCrjLocationStep(edu, { type: 'BG_REQUEST' });
    assert.equal(asking.buttonLocked, true);
    assert.equal(asking.educationVisible, true);
    const next = reduceCrjLocationStep(asking, { type: 'BG_GRANTED' });
    assert.equal(next.bgVisible, true);
    assert.equal(next.educationVisible, false);
    assert.equal(next.advance, true);
    assert.equal(next.buttonLocked, false);
  });

  it('Enable → BG denied → bgVisible false → advance', () => {
    const edu = reduceCrjLocationStep(press(), { type: 'FG_GRANTED' });
    const asking = reduceCrjLocationStep(edu, { type: 'BG_REQUEST' });
    const next = reduceCrjLocationStep(asking, { type: 'BG_DENIED' });
    assert.equal(next.bgVisible, false);
    assert.equal(next.advance, true);
    assert.equal(next.educationVisible, false);
  });

  it('FG denied → recovery, no education, unlocks after advance', () => {
    const denied = reduceCrjLocationStep(press(), { type: 'FG_DENIED' });
    assert.equal(denied.recovery, 'foreground-denied');
    assert.equal(denied.educationVisible, false);
    assert.equal(denied.buttonLocked, true);
    const done = reduceCrjLocationStep(denied, { type: 'ADVANCE_CONSUMED' });
    assert.equal(done.buttonLocked, false);
    assert.equal(done.active, false);
    assert.equal(done.recovery, 'none');
  });

  it('foreground request throws → UI unlocked, no education', () => {
    const next = reduceCrjLocationStep(press(), { type: 'FG_ERROR' });
    assert.equal(next.buttonLocked, false);
    assert.equal(next.active, false);
    assert.equal(next.educationVisible, false);
    assert.equal(next.advance, false);
  });

  it('background request throws → bgVisible false → advance', () => {
    const edu = reduceCrjLocationStep(press(), { type: 'FG_GRANTED' });
    const asking = reduceCrjLocationStep(edu, { type: 'BG_REQUEST' });
    const next = reduceCrjLocationStep(asking, { type: 'BG_ERROR' });
    assert.equal(next.bgVisible, false);
    assert.equal(next.advance, true);
    assert.equal(next.buttonLocked, false);
    assert.equal(next.educationVisible, false);
  });

  it('double press → a single foreground request', () => {
    const first = press();
    const second = reduceCrjLocationStep(first, { type: 'PRESS' });
    assert.equal(second, first);
    assert.equal(first.foregroundRequestCount, 1);
  });

  it('unmount clears the lock without leaving education up', () => {
    const edu = reduceCrjLocationStep(press(), { type: 'FG_GRANTED' });
    const next = reduceCrjLocationStep(edu, { type: 'UNMOUNT' });
    assert.equal(next.active, false);
    assert.equal(next.buttonLocked, false);
    assert.equal(next.educationVisible, false);
  });

  it('CRJ Location source does not activate, prepare, or open Settings', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const req = crj.slice(
      crj.indexOf('async function requestLocation()'),
      crj.indexOf('async function requestNotifications()'),
    );
    assert.match(req, /FG_GRANTED/);
    assert.match(req, /requestForegroundPermissionsAsync/);
    assert.match(req, /requestBackgroundPermissionsAsync/);
    assert.match(req, /bgVisible: next\.bgVisible/);
    assert.match(req, /bgVisible: false/);
    assert.doesNotMatch(req, /attemptInitialVisibilityAfterCrjCompletion/);
    assert.doesNotMatch(req, /activateVisibilityFlow/);
    assert.doesNotMatch(req, /beginLocationPermissionJourney/);
    assert.doesNotMatch(req, /LocationPreparingModal/);
    assert.doesNotMatch(req, /setLocationPreparing/);
    assert.doesNotMatch(req, /Linking\.openSettings/);
    assert.doesNotMatch(req, /needsAlwaysPermission/);
    assert.doesNotMatch(req, /await new Promise<void>/);
    assert.doesNotMatch(req, /syncBackgroundLocationRuntime/);
    assert.doesNotMatch(req, /profileSetupCompleted/);
    const notifications = crj.slice(
      crj.indexOf('async function requestNotifications()'),
      crj.indexOf('async function finishOnboarding()'),
    );
    assert.doesNotMatch(notifications, /backgroundVisibility/);
    assert.doesNotMatch(notifications, /crjLocation/);
    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    const setup = finish.indexOf('profileSetupCompleted: true');
    const sync = finish.indexOf('syncDiscoveryProfileContextFlow');
    const activate = finish.indexOf('attemptInitialVisibilityAfterCrjCompletion');
    assert.ok(setup >= 0 && sync > setup && activate > sync);
  });
});
