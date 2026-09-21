/**
 * ENH-LOC-01 — Location Experience behavioral + contract tests.
 * Pure helpers only in imports (no RN/Expo modules).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decideBackgroundEducationOffer,
  hasSeenFullBackgroundEducation,
  markFullBackgroundEducationSeen,
  resolveBackgroundEducationVariant,
  BG_LOCATION_EDUCATION_FULL_SEEN_KEY,
} from '../locationEducation';
import {
  BG_RUNTIME_ALLOWED_KEY,
  isBackgroundPermissionEffectivelyGranted,
  isPublishAllowedByRuntimeFlags,
  isSessionOnlyGrant,
  LOGOUT_CLEANUP_ORDER,
  reconcileBgVisibleWithBackgroundPermission,
  shouldRunBackgroundLocationRuntime,
  snapshotFromPermissionResponse,
  wasForegroundNewlyGranted,
} from '../backgroundLocationRuntimeGates';
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

describe('ENH-LOC-01 runtime gates (behavioral)', () => {
  it('requires auth + visibility + bgVisible simultaneously', () => {
    assert.equal(
      shouldRunBackgroundLocationRuntime({
        uid: 'u1',
        visibilityOn: true,
        bgVisible: true,
      }),
      true,
    );
    assert.equal(
      shouldRunBackgroundLocationRuntime({
        uid: 'u1',
        visibilityOn: false,
        bgVisible: true,
      }),
      false,
    );
    assert.equal(
      shouldRunBackgroundLocationRuntime({
        uid: 'u1',
        visibilityOn: true,
        bgVisible: false,
      }),
      false,
    );
  });

  it('UID A allowed flag never authorizes UID B publish', () => {
    assert.equal(
      isPublishAllowedByRuntimeFlags({
        expectedUid: 'B',
        taskUid: 'B',
        allowedUid: 'A',
      }),
      false,
    );
    assert.equal(
      isPublishAllowedByRuntimeFlags({
        expectedUid: 'A',
        taskUid: 'A',
        allowedUid: 'A',
      }),
      true,
    );
  });

  it('stale runtime-allowed flag alone is not enough to publish', () => {
    assert.equal(
      isPublishAllowedByRuntimeFlags({
        expectedUid: 'A',
        taskUid: null,
        allowedUid: 'A',
      }),
      false,
    );
    assert.equal(
      isPublishAllowedByRuntimeFlags({
        expectedUid: 'A',
        taskUid: 'A',
        allowedUid: null,
      }),
      false,
    );
  });

  it('Visibility OFF preference stops runtime even when bgVisible preference true', () => {
    assert.equal(
      shouldRunBackgroundLocationRuntime({
        uid: 'u1',
        visibilityOn: false,
        bgVisible: true,
      }),
      false,
    );
  });

  it('background revoked → effective toggle OFF + clear preference + stop runtime', () => {
    assert.deepEqual(
      reconcileBgVisibleWithBackgroundPermission({
        preferenceBgVisible: true,
        backgroundGranted: false,
      }),
      { toggleOn: false, clearPreference: true, stopRuntime: true },
    );
    assert.deepEqual(
      reconcileBgVisibleWithBackgroundPermission({
        preferenceBgVisible: true,
        backgroundGranted: true,
      }),
      { toggleOn: true, clearPreference: false, stopRuntime: false },
    );
  });
});

describe('ENH-LOC-01 permission semantics (behavioral)', () => {
  it('Allow Once / session grant is not treated as durable Always', () => {
    assert.equal(isSessionOnlyGrant('never'), false);
    assert.equal(isSessionOnlyGrant('session'), true);
    const once = snapshotFromPermissionResponse({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'session',
      ios: { scope: 'whenInUse' },
    });
    assert.equal(once.sessionOnly, true);
    assert.equal(once.iosScope, 'whenInUse');
    const always = snapshotFromPermissionResponse({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
      ios: { scope: 'always' },
    });
    assert.equal(always.sessionOnly, false);
    assert.equal(always.iosScope, 'always');
    assert.equal(isBackgroundPermissionEffectivelyGranted(always), true);
    assert.equal(
      isBackgroundPermissionEffectivelyGranted(
        snapshotFromPermissionResponse({
          status: 'denied',
          granted: false,
          canAskAgain: false,
          ios: { scope: 'always' },
        }),
      ),
      true,
    );
  });

  it('detects first-time foreground grant for education offer', () => {
    assert.equal(
      wasForegroundNewlyGranted({ beforeGranted: false, afterGranted: true }),
      true,
    );
    assert.equal(
      wasForegroundNewlyGranted({ beforeGranted: true, afterGranted: true }),
      false,
    );
  });

  it('Settings return requires both FG and BG granted; no activate without intent', () => {
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(false, 'granted', 'granted'),
      { shouldActivate: false, clearIntent: false },
    );
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'granted', 'granted'),
      { shouldActivate: true, clearIntent: true },
    );
    assert.deepEqual(
      evaluateBackgroundLocationSettingsReturn(true, 'granted', 'denied'),
      { shouldActivate: false, clearIntent: true },
    );
  });
});

describe('ENH-LOC-01 education persistence (behavioral)', () => {
  it('full first-time then brief on retry; mark after action; never Firestore writes', async () => {
    const storage = memoryStorage();
    assert.equal(await hasSeenFullBackgroundEducation(storage), false);
    assert.equal(await resolveBackgroundEducationVariant(storage), 'full');
    await markFullBackgroundEducationSeen(storage);
    assert.equal(await resolveBackgroundEducationVariant(storage), 'brief');
    assert.equal(BG_LOCATION_EDUCATION_FULL_SEEN_KEY, 'NEARSY_BG_LOCATION_EDUCATION_FULL_SEEN');

    const offer = await decideBackgroundEducationOffer({
      storage,
      backgroundGranted: false,
      bgVisible: false,
    });
    assert.equal(offer.offer, true);
    if (offer.offer) assert.equal(offer.variant, 'brief');

    assert.deepEqual(
      await decideBackgroundEducationOffer({
        storage,
        backgroundGranted: true,
        bgVisible: true,
      }),
      { offer: false, reason: 'already-configured' },
    );

    const eduSrc = readShared('visibility/locationEducation.ts');
    assert.doesNotMatch(eduSrc, /setDoc|getDoc|firestoreDb/);
  });
});

describe('ENH-LOC-01 journey wiring (same-pass connection)', () => {
  it('CRJ: FG grant → education await → Enable/Not now; activate after finishOnboarding', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const requestStart = crj.indexOf('async function requestLocation()');
    const enableStart = crj.indexOf('async function handleCrjEnableBackground()');
    const notNowStart = crj.indexOf('async function handleCrjBackgroundNotNow()');
    assert.ok(requestStart >= 0 && enableStart > requestStart && notNowStart > enableStart);

    const body = crj.slice(requestStart, enableStart);
    assert.match(body, /requestForegroundPermissionsAsync/);
    assert.doesNotMatch(body, /attemptInitialVisibilityAfterCrjCompletion/);
    assert.match(body, /FG_GRANTED/);
    assert.doesNotMatch(body, /await new Promise/);
    assert.doesNotMatch(body, /beginLocationPermissionJourney/);

    const finish = crj.slice(crj.indexOf('async function finishOnboarding()'));
    assert.match(finish, /attemptInitialVisibilityAfterCrjCompletion/);

    const notNow = crj.slice(notNowStart, notNowStart + 700);
    assert.match(notNow, /bgVisible: false/);
    assert.match(notNow, /NOT_NOW/);
    assert.doesNotMatch(notNow, /startBackgroundLocation|requestAndApply/);
  });

  it('Home: newly granted FG → education; Not now does not start BG', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /wasForegroundNewlyGranted/);
    assert.match(home, /offerBackgroundEducationIfNeeded/);
    assert.match(home, /handleHomeBackgroundNotNow/);
    const notNow = home.slice(home.indexOf('handleHomeBackgroundNotNow'));
    assert.match(notNow, /bgVisible: false/);
    assert.doesNotMatch(
      notNow.slice(0, 600),
      /requestAndApplyBackgroundLocation/,
    );
  });

  it('More: toggle ON educates; OFF stops; logout order stop→deactivate→signOut', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /offerMoreBackgroundEducation/);
    assert.match(more, /Keep toggle visually OFF until enable succeeds/);
    assert.match(more, /reconcileBgVisibleWithBackgroundPermission/);
    assert.match(more, /ensureBackgroundLocationPermissions|requestAndApplyBackgroundLocation/);

    const logout = more.slice(more.indexOf('const handleLogout'));
    const stopIdx = logout.indexOf('stopBackgroundLocationRuntime');
    const deactIdx = logout.indexOf('deactivateVisibilityFlow');
    const signIdx = logout.indexOf('firebaseAuth.signOut');
    assert.ok(stopIdx >= 0 && deactIdx > stopIdx && signIdx > deactIdx);
    assert.deepEqual([...LOGOUT_CLEANUP_ORDER], [
      'stopBackgroundLocationRuntime',
      'deactivateVisibilityFlow',
      'firebaseAuth.signOut',
    ]);
  });

  it('requestAndApply requests perms without starting task before sync', () => {
    const runtime = readShared('visibility/backgroundLocationRuntime.ts');
    assert.match(runtime, /ensureBackgroundLocationPermissions\(true\)/);
    assert.match(runtime, /readBackgroundPermissionSnapshot/);
    assert.match(runtime, /syncBackgroundLocationRuntime/);
    // Must not start task before effective BG re-read / sync gates.
    const applyStart = runtime.indexOf('requestAndApplyBackgroundLocation');
    const applyBody = runtime.slice(applyStart, applyStart + 1200);
    assert.doesNotMatch(applyBody, /startBackgroundLocation\(\{/);
  });

  it('task publish blocked without matching runtime-allowed UID', () => {
    const task = readShared('background/locationTask.ios.ts');
    assert.match(task, /NEARSY_BG_RUNTIME_ALLOWED/);
    assert.match(task, /allowedUid !== uid/);
    assert.equal(BG_RUNTIME_ALLOWED_KEY, 'NEARSY_BG_RUNTIME_ALLOWED');
  });
});

describe('ENH-LOC-01 copy / theme / native intact', () => {
  it('EN/ES education keys and modal Light/Dark + cancel path', () => {
    const en = readShared('i18n/resources/settings.ts');
    assert.match(en, /enableBackground:/);
    assert.match(en, /notNow:/);
    assert.match(en, /servicesOffTitle:/);
    assert.match(en, /accuracyTitle:/);

    const es = readShared('i18n/locales/es.ts');
    assert.match(es, /Activar ubicación en segundo plano/);
    assert.match(es, /Ahora no/);

    const modal = readShared('components/BackgroundLocationEducationModal.tsx');
    assert.match(modal, /useAppTheme/);
    assert.match(modal, /onRequestClose/);
    assert.match(modal, /accessibilityRole/);
  });

  it('keeps Info.plist location strings and LOCATION_TTL_MS unchanged', () => {
    const appJson = readFileSync(
      join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-ios', 'app.json'),
      'utf8',
    );
    assert.match(appJson, /NSLocationWhenInUseUsageDescription/);
    assert.match(appJson, /NSLocationAlwaysAndWhenInUseUsageDescription/);
    assert.match(appJson, /"location"/);

    const constants = readShared('visibility/constants.ts');
    assert.match(constants, /LOCATION_TTL_MS = 3_600_000/);
  });
});
