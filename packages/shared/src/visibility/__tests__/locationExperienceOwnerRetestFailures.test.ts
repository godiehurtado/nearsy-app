/**
 * ENH-LOC-01 Owner retest failures (SHA 9afa4c0) — behavioral + wiring.
 * Covers: CRJ education await, Always≠Settings, toggle unlock, More OFF copy.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  beginLocationPermissionJourney,
  clearLocationPermissionJourneySession,
  endLocationPermissionJourney,
  hasSessionBackgroundEducationOffered,
  isLocationPermissionJourneyActive,
  markSessionBackgroundEducationOffered,
  shouldContinueToBackgroundEducation,
} from '../locationPermissionJourney';
import {
  isBackgroundPermissionEffectivelyGranted,
  snapshotFromPermissionResponse,
} from '../backgroundLocationRuntimeGates';
import { resolveVisibilityPresentation } from '../visibilityPresentation';
import { decideBackgroundEducationOffer } from '../locationEducation';
import { evaluateBackgroundLocationSettingsReturn } from '../settingsRecovery';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    async getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key: string, value: string) {
      map.set(key, value);
    },
    async removeItem(key: string) {
      map.delete(key);
    },
  };
}

beforeEach(() => {
  clearLocationPermissionJourneySession();
});

describe('Owner retest — FG→education invariant (activate-independent)', () => {
  it('truth table: FG granted → education regardless of activate outcome', () => {
    const base = {
      uid: 'u1',
      alreadyOfferedThisSession: false,
      requireNewlyGranted: false,
      foregroundNewlyGranted: false,
    };
    // FG absent → no education
    assert.equal(
      shouldContinueToBackgroundEducation({
        ...base,
        foregroundGranted: false,
      }),
      false,
    );
    // FG granted + (conceptual) activate success → education
    assert.equal(
      shouldContinueToBackgroundEducation({
        ...base,
        foregroundGranted: true,
      }),
      true,
    );
    // FG granted + network/callable/inactive — same helper, still true
    assert.equal(
      shouldContinueToBackgroundEducation({
        ...base,
        foregroundGranted: true,
        foregroundNewlyGranted: true,
      }),
      true,
    );
  });

  it('Home recovery offers education after FG even when restoreOk is false', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const restore = home.slice(
      home.indexOf('runPostGrantRestore'),
      home.indexOf('preserve-intent-then-deactivate'),
    );
    assert.match(restore, /offerBackgroundEducationIfNeeded/);
    assert.match(restore, /No preparation modal/);
    assert.doesNotMatch(restore, /setLocationPreparing\(true\)/);
    assert.doesNotMatch(
      restore,
      /restoreOk &&\s*shouldContinueToBackgroundEducation/,
    );
  });

  it('CRJ requestLocation does not return early before education on activate fail', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const req = crj.slice(
      crj.indexOf('async function requestLocation()'),
      crj.indexOf('async function handleCrjEnableBackground()'),
    );
    // Location no longer activates — education follows FG without activationResult.
    assert.doesNotMatch(req, /attemptInitialVisibilityAfterCrjCompletion/);
    assert.match(req, /FG_GRANTED/);
    assert.doesNotMatch(req, /LocationPreparingModal/);
  });

  it('activation failure does not mark Visibility Active in CRJ', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const req = crj.slice(
      crj.indexOf('async function requestLocation()'),
      crj.indexOf('async function handleCrjEnableBackground()'),
    );
    assert.doesNotMatch(req, /setCrjVisibilityOn\(true\)/);
    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    assert.match(finish, /setCrjVisibilityOn\(activated\)/);
  });
});

describe('Owner retest — Always effective grant (defect B Settings false positive)', () => {
  it('15–16: ios.scope always is effective grant even if status lags', () => {
    const lagging = snapshotFromPermissionResponse({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
      ios: { scope: 'always' },
    });
    assert.equal(isBackgroundPermissionEffectivelyGranted(lagging), true);

    const whenInUse = snapshotFromPermissionResponse({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      ios: { scope: 'whenInUse' },
    });
    assert.equal(isBackgroundPermissionEffectivelyGranted(whenInUse), false);

    const androidGranted = snapshotFromPermissionResponse({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    });
    assert.equal(isBackgroundPermissionEffectivelyGranted(androidGranted), true);
  });

  it('pending Settings intent clears when background effectively granted', () => {
    const evaluation = evaluateBackgroundLocationSettingsReturn(
      true,
      'granted',
      'granted',
    );
    assert.equal(evaluation.clearIntent, true);
    assert.equal(evaluation.shouldActivate, true);
  });

  it('Home/CRJ/More re-read effective Always; Settings only from More', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const more = readShared('screens/MoreScreen.tsx');
    for (const src of [home, crj, more]) {
      assert.match(src, /isBackgroundPermissionEffectivelyGranted/);
    }
    // Automatic owners: no BG Settings alert
    const homeEnable = home.slice(
      home.indexOf('handleHomeEnableBackground'),
      home.indexOf('handleHomeBackgroundNotNow'),
    );
    assert.doesNotMatch(homeEnable, /needsAlwaysPermission/);
    const crjEnable = crj.slice(
      crj.indexOf('async function handleCrjEnableBackground()'),
      crj.indexOf('async function handleCrjBackgroundNotNow()'),
    );
    assert.doesNotMatch(crjEnable, /needsAlwaysPermission/);
    // More may offer Settings
    assert.match(more, /needsAlwaysPermission/);
  });
});

describe('Owner retest — Visibility toggle unlock (defect B/G)', () => {
  it('18–19: validated ON keeps allowToggle even if validationPending stale', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: true,
      operationBusy: false,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.allowToggle, true);
    assert.equal(ui.canStartRuntime, true);
  });

  it('Always granted is never a reason to disable toggle', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
      operationBusy: false,
    });
    assert.equal(ui.allowToggle, true);
  });

  it('operationBusy locks toggle; clears when busy ends', () => {
    const busy = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
      operationBusy: true,
    });
    assert.equal(busy.allowToggle, false);
    const idle = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
      operationBusy: false,
    });
    assert.equal(idle.allowToggle, true);
  });

  it('24–25: hydration stays Active; unknown does not invent Inactive', () => {
    const pending = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(pending.visualActive, true);
    assert.equal(pending.canStartRuntime, false);

    const unknown = resolveVisibilityPresentation({
      profileLoaded: false,
      persistedVisibility: undefined,
      validationPending: false,
      validatedEffective: null,
    });
    assert.equal(unknown.visualActive, null);
  });

  it('Home onSnapshot rearms hydration when entering persisted ON (BUG-VIS-01)', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /hydrationValidationDoneRef/);
    assert.match(home, /shouldRearmVisibilityHydration/);
    assert.match(home, /visibilityHydrationKick/);
    assert.match(home, /lastPersistedVisibilityRef/);
    assert.match(home, /operationBusy:/);
    // Mutex steal must not finishValidation(false)
    assert.doesNotMatch(
      home,
      /if \(!token\) \{\s*finishValidation\(false\)/,
    );
  });
});

describe('Owner retest — CRJ atomic education (defect A)', () => {
  it('1–7: education stays up until Enable/Not now; Location does not await a modal', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const reqStart = crj.indexOf('async function requestLocation()');
    const reqEnd = crj.indexOf('async function handleCrjEnableBackground()');
    const body = crj.slice(reqStart, reqEnd);
    assert.match(body, /FG_GRANTED/);
    assert.doesNotMatch(body, /await new Promise/);
    assert.doesNotMatch(body, /setLocationPreparing\(true\)/);
    const enable = crj.slice(crj.indexOf('async function handleCrjEnableBackground()'));
    assert.match(enable, /BG_GRANTED/);
    assert.match(enable, /advanceCrjLocationIfNeeded/);
  });

  it('6–9: continueEducation gates on FG grant, not activate; Not now does not undo Visibility', () => {
    assert.equal(
      shouldContinueToBackgroundEducation({
        foregroundGranted: true,
        foregroundNewlyGranted: false,
        requireNewlyGranted: false,
        uid: 'u1',
        alreadyOfferedThisSession: false,
      }),
      true,
    );
    assert.equal(
      shouldContinueToBackgroundEducation({
        foregroundGranted: false,
        foregroundNewlyGranted: false,
        requireNewlyGranted: false,
        uid: 'u1',
        alreadyOfferedThisSession: false,
      }),
      false,
    );
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /handleCrjBackgroundNotNow[\s\S]*bgVisible: false/);
    assert.doesNotMatch(
      crj.slice(
        crj.indexOf('async function handleCrjBackgroundNotNow()'),
        crj.indexOf('async function requestNotifications()'),
      ),
      /setCrjVisibilityOn\(false\)/,
    );
  });

  it('10–12: finishOnboarding activates after completion; Location owns permissions only', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    assert.match(finish, /profileSetupCompleted: true/);
    assert.match(finish, /attemptInitialVisibilityAfterCrjCompletion/);
    assert.doesNotMatch(finish, /setBgEducationOpen\(true\)/);
    assert.doesNotMatch(finish, /needsAlwaysPermission/);
    assert.match(finish, /navigation\.reset/);
    const req = crj.slice(
      crj.indexOf('async function requestLocation()'),
      crj.indexOf('async function handleCrjEnableBackground()'),
    );
    assert.doesNotMatch(req, /attemptInitialVisibilityAfterCrjCompletion/);
  });

  it('11: CRJ journey blocks Home recovery steal', () => {
    const token = beginLocationPermissionJourney('u1', 'crj');
    assert.ok(token);
    assert.equal(beginLocationPermissionJourney('u1', 'home-recovery'), null);
    assert.equal(isLocationPermissionJourneyActive(), true);
    endLocationPermissionJourney(token);
    assert.ok(beginLocationPermissionJourney('u1', 'home-recovery'));
  });

  it('session mark after education close — Home path', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const offer = home.slice(
      home.indexOf('offerBackgroundEducationIfNeeded'),
      home.indexOf('const activateVisibility'),
    );
    const awaitEdu = offer.indexOf('setBgEducationOpen(true)');
    const mark = offer.indexOf('markSessionBackgroundEducationOffered(uid)');
    assert.ok(awaitEdu >= 0 && mark > awaitEdu);
  });
});

describe('Owner retest — More OFF vs iOS Always (defect C)', () => {
  it('26–30: OFF copy EN/ES + Done/Open Settings; no auto Settings on OFF', () => {
    const en = readShared('i18n/resources/settings.ts');
    const es = readShared('i18n/locales/es.ts');
    assert.match(en, /Background updates are off/);
    assert.match(
      en,
      /Nearsy will no longer update your location in the background/,
    );
    assert.match(en, /disabledDone:\s*'Done'/);
    assert.match(
      es,
      /Las actualizaciones en segundo plano están desactivadas/,
    );
    assert.match(
      es,
      /Nearsy dejará de actualizar tu ubicación en segundo plano/,
    );
    assert.match(es, /disabledDone:\s*'Listo'/);
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(
      more,
      /backgroundVisibility\.disabledTitle[\s\S]{0,200}disabledDone/,
    );
    assert.match(more, /stopBackgroundLocationRuntime/);
    assert.doesNotMatch(en, /Always was revoked|Always has been revoked/i);
  });

  it('28: ON with Always already granted skips education request', async () => {
    const offer = await decideBackgroundEducationOffer({
      storage: memoryStorage(),
      backgroundGranted: true,
      bgVisible: false,
    });
    assert.equal(offer.offer, false);
  });
});

describe('Owner retest — concurrency / logout clears', () => {
  it('31–34: clear session releases mutex and education guard', () => {
    markSessionBackgroundEducationOffered('u1');
    beginLocationPermissionJourney('u1', 'crj');
    clearLocationPermissionJourneySession();
    assert.equal(hasSessionBackgroundEducationOffered('u1'), false);
    assert.equal(isLocationPermissionJourneyActive(), false);
    assert.ok(beginLocationPermissionJourney('u1', 'more'));
  });

  it('App clears journey on logout / account switch', () => {
    const app = readShared('App.tsx');
    assert.match(app, /clearLocationPermissionJourneySession/);
  });
});
