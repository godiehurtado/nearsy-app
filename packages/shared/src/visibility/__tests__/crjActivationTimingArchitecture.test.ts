/**
 * ENH-LOC-01 — CRJ activation timing architecture (profile completeness).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

describe('ENH-LOC-01 CRJ activation timing architecture', () => {
  it('activateVisibility is NOT called in Location while CRJ incomplete', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const req = crj.slice(
      crj.indexOf('async function requestLocation()'),
      crj.indexOf('async function handleCrjEnableBackground()'),
    );
    assert.doesNotMatch(req, /attemptInitialVisibilityAfterCrjCompletion/);
    assert.doesNotMatch(req, /activateVisibilityFlow|client\.activateVisibility/);
    assert.match(req, /Do NOT activateVisibility|profile still incomplete|profile-incomplete/);
  });

  it('FG grant → BG education without activate dependency', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const req = crj.slice(
      crj.indexOf('async function requestLocation()'),
      crj.indexOf('async function handleCrjEnableBackground()'),
    );
    assert.match(req, /shouldContinueToBackgroundEducation/);
    assert.match(req, /decideBackgroundEducationOffer/);
    assert.match(req, /setBgEducationOpen\(true\)/);
    assert.doesNotMatch(req, /attemptInitialVisibilityAfterCrjCompletion/);
  });

  it('finishOnboarding persists profileSetupCompleted before activate', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    const setup = finish.indexOf('profileSetupCompleted: true');
    const sync = finish.indexOf('syncDiscoveryProfileContextFlow');
    const activate = finish.indexOf('attemptInitialVisibilityAfterCrjCompletion');
    assert.ok(setup >= 0);
    assert.ok(activate > setup);
    assert.ok(sync > setup && sync < activate);
  });

  it('activate occurs once after completion; runtime waits for activate success', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    const activateCalls = finish.match(
      /attemptInitialVisibilityAfterCrjCompletion/g,
    );
    assert.equal(activateCalls?.length, 1);
    assert.match(
      finish,
      /syncBackgroundLocationRuntime\(\{[\s\S]*?visibilityOn:\s*true/,
    );
  });

  it('CRJ background deny → foreground-only without Settings alert', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const enable = crj.slice(
      crj.indexOf('async function handleCrjEnableBackground()'),
      crj.indexOf('async function handleCrjBackgroundNotNow()'),
    );
    assert.match(enable, /needsSettings:\s*false/);
    assert.doesNotMatch(enable, /needsAlwaysPermission/);
    assert.doesNotMatch(enable, /Linking\.openSettings/);
  });

  it('Home automatic BG education deny has no Settings alert', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const enable = home.slice(
      home.indexOf('handleHomeEnableBackground'),
      home.indexOf('handleHomeBackgroundNotNow'),
    );
    assert.match(enable, /foreground-only, no Settings/);
    assert.doesNotMatch(enable, /needsAlwaysPermission/);
  });

  it('More explicit background failure may offer Open Settings', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /showNeedsAlwaysSettings|needsAlwaysPermission/);
    assert.match(more, /Linking\.openSettings/);
  });

  it('backend contract knows profile-incomplete for activateVisibility', () => {
    const errors = readShared('visibility/callables/errors.ts');
    assert.match(errors, /profile-incomplete/);
    const presentation = readShared(
      'visibility/visibilityErrorPresentation.ts',
    );
    assert.match(presentation, /profile-incomplete/);
  });

  it('historical contract: attemptInitial after CRJ completion helper name', () => {
    const helper = readShared('visibility/initialCrjVisibilityActivation.ts');
    assert.match(helper, /after legitimate CRJ completion/);
    assert.match(helper, /activateVisibilityFlow/);
  });
});
