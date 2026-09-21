/**
 * ENH-LOC-01 location permission journey state machine — transition tests.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canAdvanceNavigation,
  canPresentSettingsAlert,
  createInitialLocationJourneyState,
  deriveJourneyPresentation,
  deriveVisibilityToggleDisabled,
  mapCrjActivationReasonToResult,
  reduceLocationJourney,
  shouldUseLocationNotEnabledCopy,
} from '../locationPermissionJourneyMachine';
import {
  beginLocationPermissionJourney,
  clearLocationPermissionJourneySession,
  dispatchLocationJourney,
  getLocationJourneyState,
  reconcileLocationJourneyOnColdStart,
} from '../locationPermissionJourney';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

beforeEach(() => {
  clearLocationPermissionJourneySession();
});

describe('location journey machine — CRJ happy path', () => {
  it('idle → FG → preparing → education → BG request → completed → can navigate', () => {
    let s = createInitialLocationJourneyState();
    s = reduceLocationJourney(s, {
      type: 'START',
      owner: 'crj',
      uidFingerprint: 'u1',
      token: 't1',
    });
    assert.equal(s.phase, 'requestingForeground');
    assert.equal(canAdvanceNavigation(s), false);

    s = reduceLocationJourney(s, { type: 'FOREGROUND_RESULT', granted: true });
    assert.equal(s.phase, 'preparing');
    assert.equal(deriveJourneyPresentation(s), 'preparing');

    s = reduceLocationJourney(s, {
      type: 'ACTIVATION_RESULT',
      result: 'success',
    });
    assert.equal(s.phase, 'showingBackgroundEducation');
    assert.equal(deriveJourneyPresentation(s), 'backgroundEducation');

    s = reduceLocationJourney(s, {
      type: 'BACKGROUND_DECISION',
      decision: 'enable',
    });
    assert.equal(s.phase, 'requestingBackground');

    s = reduceLocationJourney(s, {
      type: 'BACKGROUND_RESULT',
      effectiveGranted: true,
      needsSettings: false,
    });
    assert.equal(s.phase, 'completed');
    assert.equal(s.settingsIntentOwner, null);
    assert.equal(canAdvanceNavigation(s), true);
    assert.equal(deriveJourneyPresentation(s), 'none');
  });
});

describe('location journey machine — activation failure', () => {
  it('stores activation failure, reports issue, then continues to education', () => {
    let s = createInitialLocationJourneyState();
    s = reduceLocationJourney(s, {
      type: 'START',
      owner: 'crj',
      uidFingerprint: 'u1',
      token: 't1',
    });
    s = reduceLocationJourney(s, { type: 'FOREGROUND_RESULT', granted: true });
    s = reduceLocationJourney(s, {
      type: 'ACTIVATION_RESULT',
      result: 'network_or_backend',
    });
    assert.equal(s.phase, 'reportingActivationIssue');
    assert.equal(s.activationResult, 'network_or_backend');
    assert.equal(deriveJourneyPresentation(s), 'activationIssue');
    assert.equal(canAdvanceNavigation(s), false);

    s = reduceLocationJourney(s, { type: 'ACTIVATION_ISSUE_ACKNOWLEDGED' });
    assert.equal(s.phase, 'showingBackgroundEducation');
    assert.equal(s.foregroundEffective, true);
  });

  it('maps callable/unavailable to network_or_backend — not Location not enabled', () => {
    assert.equal(mapCrjActivationReasonToResult('callable'), 'network_or_backend');
    assert.equal(mapCrjActivationReasonToResult('unavailable'), 'unavailable');
    assert.equal(
      shouldUseLocationNotEnabledCopy({
        foregroundGranted: true,
        servicesOff: false,
      }),
      false,
    );
    assert.equal(
      shouldUseLocationNotEnabledCopy({
        foregroundGranted: false,
        servicesOff: false,
      }),
      true,
    );
  });
});

describe('location journey machine — Always / Settings', () => {
  it('effective Always completes and clears Settings intent; no late alert', () => {
    let s = createInitialLocationJourneyState();
    s = reduceLocationJourney(s, {
      type: 'START',
      owner: 'crj',
      uidFingerprint: 'u1',
      token: 't1',
    });
    s = reduceLocationJourney(s, { type: 'FOREGROUND_RESULT', granted: true });
    s = reduceLocationJourney(s, {
      type: 'ACTIVATION_RESULT',
      result: 'success',
    });
    s = reduceLocationJourney(s, {
      type: 'BACKGROUND_DECISION',
      decision: 'enable',
    });
    s = reduceLocationJourney(s, {
      type: 'BACKGROUND_RESULT',
      effectiveGranted: true,
      needsSettings: true, // ignored when granted
    });
    assert.equal(s.phase, 'completed');
    assert.equal(s.settingsIntentOwner, null);
    assert.equal(canPresentSettingsAlert(s, 'crj'), false);
  });

  it('Settings alert only while waitingForSettingsReturn + same owner', () => {
    let s = createInitialLocationJourneyState();
    s = reduceLocationJourney(s, {
      type: 'START',
      owner: 'crj',
      uidFingerprint: 'u1',
      token: 't1',
    });
    s = reduceLocationJourney(s, { type: 'FOREGROUND_RESULT', granted: true });
    s = reduceLocationJourney(s, {
      type: 'ACTIVATION_RESULT',
      result: 'success',
    });
    s = reduceLocationJourney(s, {
      type: 'BACKGROUND_DECISION',
      decision: 'enable',
    });
    s = reduceLocationJourney(s, {
      type: 'BACKGROUND_RESULT',
      effectiveGranted: false,
      needsSettings: true,
    });
    assert.equal(s.phase, 'waitingForSettingsReturn');
    assert.equal(canPresentSettingsAlert(s, 'crj'), true);
    assert.equal(canPresentSettingsAlert(s, 'home'), false);

    s = reduceLocationJourney(s, {
      type: 'SETTINGS_RETURN',
      backgroundGranted: false,
    });
    assert.equal(s.phase, 'completed');
    assert.equal(canPresentSettingsAlert(s, 'crj'), false);
  });
});

describe('location journey machine — locks', () => {
  it('toggle disabled only for mutation or hydration — never Always/education', () => {
    assert.equal(
      deriveVisibilityToggleDisabled({
        visibilityMutationInFlight: false,
        initialVisibilityHydrationPending: false,
      }),
      false,
    );
    assert.equal(
      deriveVisibilityToggleDisabled({
        visibilityMutationInFlight: true,
        initialVisibilityHydrationPending: false,
      }),
      true,
    );
    assert.equal(
      deriveVisibilityToggleDisabled({
        visibilityMutationInFlight: false,
        initialVisibilityHydrationPending: true,
      }),
      true,
    );
  });

  it('cold start / logout clears ephemeral locks', () => {
    const token = beginLocationPermissionJourney('u1', 'crj');
    assert.ok(token);
    dispatchLocationJourney({
      type: 'SET_VISIBILITY_MUTATION',
      inFlight: true,
    });
    dispatchLocationJourney({ type: 'SET_HYDRATION_PENDING', pending: true });
    reconcileLocationJourneyOnColdStart();
    const s = getLocationJourneyState();
    assert.equal(s.phase, 'idle');
    assert.equal(s.visibilityMutationInFlight, false);
    assert.equal(s.initialVisibilityHydrationPending, false);
    assert.equal(s.owner, null);
  });

  it('second owner cannot steal active CRJ journey', () => {
    assert.ok(beginLocationPermissionJourney('u1', 'crj'));
    assert.equal(beginLocationPermissionJourney('u1', 'home-recovery'), null);
    assert.equal(getLocationJourneyState().owner, 'crj');
  });
});

describe('location journey machine — wiring', () => {
  it('CRJ awaits activation issue before education; finishOnboarding has no permission UI', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /reportingActivationIssue|ACTIVATION_ISSUE_ACKNOWLEDGED/);
    assert.match(crj, /activationIssueTitle/);
    assert.match(crj, /canPresentSettingsAlert/);
    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    assert.match(finish, /NEVER reopen education\/Settings UI/);
    assert.doesNotMatch(finish, /setBgEducationOpen\(true\)/);
    assert.doesNotMatch(finish, /needsAlwaysPermission/);
  });

  it('Home toggle locks only on statusUpdating — not education/Always', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /operationBusy:\s*statusUpdating/);
    assert.doesNotMatch(
      home,
      /operationBusy:\s*statusUpdating\s*\|\|\s*locationPreparing/,
    );
  });

  it('More OFF uses Done + Open Settings copy', () => {
    const en = readShared('i18n/resources/settings.ts');
    const es = readShared('i18n/locales/es.ts');
    assert.match(en, /Background updates are off/);
    assert.match(en, /disabledDone:\s*'Done'/);
    assert.match(es, /Las actualizaciones en segundo plano están desactivadas/);
    assert.match(es, /disabledDone:\s*'Listo'/);
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /disabledTitle/);
    assert.match(more, /disabledDone/);
  });

  it('App reconciles journey on cold start', () => {
    const app = readShared('App.tsx');
    assert.match(app, /reconcileLocationJourneyOnColdStart/);
  });
});
