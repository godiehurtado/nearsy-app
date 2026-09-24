/**
 * ENH-LOC-01 — background publication gates + education + journey + runtime auth.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/location/__tests__/locationExperience.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decideBackgroundPublication,
  requiresSettingsForBackgroundPermission,
  shouldStartBackgroundLocationService,
  isLocationSampleAdequateForNearby,
  isAndroidFineLocationGranted,
  ANDROID_BACKGROUND_SETTINGS_API_LEVEL,
} from '../backgroundPublicationGate.ts';
import {
  NEARSY_BG_LOCATION_EDUCATION_SEEN,
  hasSeenBackgroundLocationEducation,
  markBackgroundLocationEducationSeen,
  resolveBackgroundDisclosureVariant,
} from '../backgroundEducationStorage.ts';
import {
  runContractualAndroidLogout,
  shouldReconcileBgPreferenceOff,
} from '../contractualLogout.ts';
import {
  decideCallbackPublication,
  type BackgroundRuntimeAuth,
} from '../backgroundRuntimeAuth.ts';
import {
  disposeBackgroundPublishFailure,
  isHeadlessPublishEnvironmentReady,
} from '../backgroundPublishDisposition.ts';
import {
  bindLocationJourneySessionUid,
  beginLocationJourney,
  endLocationJourney,
  markBackgroundDisclosureOfferedThisSession,
  markPostLoginLocationRecoveryNeeded,
  consumePostLoginLocationRecovery,
  peekPostLoginLocationRecovery,
  resetLocationJourneySession,
  shouldOfferBackgroundDisclosureAfterFgGrant,
  shouldRenderPreparationForElapsedMs,
  wasBackgroundDisclosureOfferedThisSession,
} from '../locationJourneySession.ts';
import {
  evaluateVisibilityHydration,
  isHomeSearchEnabled,
  resolvePermissionValidationOnVisibilitySnapshot,
  shouldResetPermissionValidationOnVisibilityChange,
} from '../visibilityHydration.ts';
import {
  clearCrjVisibilityProvisionalActive,
  consumeCrjVisibilityProvisionalActive,
  markCrjVisibilityProvisionalActive,
  peekCrjVisibilityProvisionalActive,
} from '../../visibility/crjVisibilityProvisional.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

describe('backgroundPublicationGate', () => {
  it('requires auth + visibility + bgVisible + both permissions', () => {
    const ok = decideBackgroundPublication({
      authenticated: true,
      visibility: true,
      bgVisible: true,
      foregroundGranted: true,
      backgroundGranted: true,
      storedTaskUid: 'u1',
      currentUid: 'u1',
    });
    assert.equal(ok.action, 'publish');
  });

  it('BG granted + Visibility OFF → stop (no publish)', () => {
    const d = decideBackgroundPublication({
      authenticated: true,
      visibility: false,
      bgVisible: true,
      foregroundGranted: true,
      backgroundGranted: true,
      storedTaskUid: 'u1',
      currentUid: 'u1',
    });
    assert.equal(d.action, 'stop');
    assert.equal(d.reason, 'visibility-off');
  });

  it('bgVisible true + Visibility OFF does not start service', () => {
    assert.equal(
      shouldStartBackgroundLocationService({
        authenticated: true,
        visibility: false,
        bgVisible: true,
        foregroundGranted: true,
        backgroundGranted: true,
      }),
      false,
    );
  });

  it('NEARSY_BG_UID stale (uid mismatch) stops', () => {
    const d = decideBackgroundPublication({
      authenticated: true,
      visibility: true,
      bgVisible: true,
      foregroundGranted: true,
      backgroundGranted: true,
      storedTaskUid: 'old-uid',
      currentUid: 'new-uid',
    });
    assert.equal(d.action, 'stop');
    assert.equal(d.reason, 'uid-mismatch');
  });

  it('unauthenticated stops', () => {
    const d = decideBackgroundPublication({
      authenticated: false,
      visibility: true,
      bgVisible: true,
      foregroundGranted: true,
      backgroundGranted: true,
      storedTaskUid: 'u1',
      currentUid: null,
    });
    assert.equal(d.action, 'stop');
    assert.equal(d.reason, 'unauthenticated');
  });

  it('Android 10 uses dialog path; Android 11+ requires Settings', () => {
    assert.equal(requiresSettingsForBackgroundPermission(29), false);
    assert.equal(requiresSettingsForBackgroundPermission(30), true);
    assert.equal(requiresSettingsForBackgroundPermission(36), true);
    assert.equal(ANDROID_BACKGROUND_SETTINGS_API_LEVEL, 30);
  });

  it('approximate/coarse accuracy is inadequate for 200ft nearby', () => {
    assert.equal(isLocationSampleAdequateForNearby(150, 100), false);
    assert.equal(isLocationSampleAdequateForNearby(50, 100), true);
    assert.equal(isAndroidFineLocationGranted('coarse'), false);
    assert.equal(isAndroidFineLocationGranted('fine'), true);
    assert.equal(isAndroidFineLocationGranted(null), true);
  });

  it('approximate / coarse stops publication gate', () => {
    const d = decideBackgroundPublication({
      authenticated: true,
      visibility: true,
      bgVisible: true,
      foregroundGranted: true,
      fineLocationGranted: false,
      backgroundGranted: true,
      storedTaskUid: 'u1',
      currentUid: 'u1',
    });
    assert.equal(d.action, 'stop');
    assert.equal(d.reason, 'foreground-denied');
  });
});

describe('backgroundEducationStorage', () => {
  it('full first time, brief after mark', async () => {
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
    assert.equal(await resolveBackgroundDisclosureVariant(storage), 'full');
    await markBackgroundLocationEducationSeen(storage);
    assert.equal(await hasSeenBackgroundLocationEducation(storage), true);
    assert.equal(await resolveBackgroundDisclosureVariant(storage), 'brief');
    assert.equal(NEARSY_BG_LOCATION_EDUCATION_SEEN, 'NEARSY_BG_LOCATION_EDUCATION_SEEN');
  });
});

describe('contractualLogout + preference reconcile', () => {
  it('logout order: stop → deactivate if active → signOut', async () => {
    const steps: string[] = [];
    await runContractualAndroidLogout({
      clearSocialPrefill: () => steps.push('prefill'),
      stopBackground: async () => {
        steps.push('stop');
      },
      isVisibilityActive: () => true,
      deactivateVisibility: async () => {
        steps.push('deactivate');
      },
      signOut: async () => {
        steps.push('signOut');
      },
    });
    assert.deepEqual(steps, ['prefill', 'stop', 'deactivate', 'signOut']);
  });

  it('logout skips deactivate when Visibility already OFF', async () => {
    const steps: string[] = [];
    await runContractualAndroidLogout({
      clearSocialPrefill: () => steps.push('prefill'),
      stopBackground: async () => {
        steps.push('stop');
      },
      isVisibilityActive: () => false,
      deactivateVisibility: async () => {
        steps.push('deactivate');
      },
      signOut: async () => {
        steps.push('signOut');
      },
    });
    assert.deepEqual(steps, ['prefill', 'stop', 'signOut']);
  });

  it('reconciles bgVisible preference OFF when background permission revoked', () => {
    assert.equal(
      shouldReconcileBgPreferenceOff({
        bgVisiblePreference: true,
        backgroundGranted: false,
      }),
      true,
    );
    assert.equal(
      shouldReconcileBgPreferenceOff({
        bgVisiblePreference: true,
        backgroundGranted: true,
      }),
      false,
    );
    assert.equal(
      shouldReconcileBgPreferenceOff({
        bgVisiblePreference: false,
        backgroundGranted: false,
      }),
      false,
    );
  });
});

describe('preparation timing (no artificial delay)', () => {
  it('does not render for near-instant work', () => {
    assert.equal(shouldRenderPreparationForElapsedMs(0), false);
    assert.equal(shouldRenderPreparationForElapsedMs(79), false);
    assert.equal(shouldRenderPreparationForElapsedMs(80), true);
  });

  it('CRJ and Home reinstall must not use preparation coordinator', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.doesNotMatch(crj, /LocationPreparationModal|beginPostForegroundDisclosureJourney|locationJourneyCoordinator/);
    assert.doesNotMatch(home, /LocationPreparationModal|setLocationPreparing\(true\)|locationJourneyCoordinator/);
  });
});

describe('locationJourneySession', () => {
  it('FG grant offers disclosure unless BG already granted or already offered', () => {
    assert.equal(
      shouldOfferBackgroundDisclosureAfterFgGrant({
        backgroundAlreadyGranted: true,
        disclosureOfferedThisSession: false,
      }),
      false,
    );
    assert.equal(
      shouldOfferBackgroundDisclosureAfterFgGrant({
        backgroundAlreadyGranted: false,
        disclosureOfferedThisSession: true,
      }),
      false,
    );
    assert.equal(
      shouldOfferBackgroundDisclosureAfterFgGrant({
        backgroundAlreadyGranted: false,
        disclosureOfferedThisSession: false,
      }),
      true,
    );
  });

  it('journey lock is single-flight; account switch resets', () => {
    resetLocationJourneySession();
    bindLocationJourneySessionUid('u1');
    assert.equal(beginLocationJourney(), true);
    assert.equal(beginLocationJourney(), false);
    endLocationJourney();
    assert.equal(beginLocationJourney(), true);
    markBackgroundDisclosureOfferedThisSession();
    assert.equal(wasBackgroundDisclosureOfferedThisSession(), true);
    bindLocationJourneySessionUid('u2');
    assert.equal(wasBackgroundDisclosureOfferedThisSession(), false);
    resetLocationJourneySession();
  });

  it('post-login recovery is one-shot per uid', () => {
    resetLocationJourneySession();
    markPostLoginLocationRecoveryNeeded('u1');
    assert.equal(peekPostLoginLocationRecovery('u1'), true);
    assert.equal(peekPostLoginLocationRecovery('u2'), false);
    assert.equal(consumePostLoginLocationRecovery('u2'), false);
    assert.equal(consumePostLoginLocationRecovery('u1'), true);
    assert.equal(consumePostLoginLocationRecovery('u1'), false);
  });
});

describe('visibilityHydration', () => {
  it('unknown profile → neutral, not false Inactive', () => {
    const h = evaluateVisibilityHydration({
      profileLoaded: false,
      persistedVisibility: undefined,
      permissionValidationPending: false,
    });
    assert.equal(h.phase, 'unknown');
    assert.equal(h.displayActive, false);
    assert.equal(h.runtimeEligible, false);
    assert.equal(h.toggleDisabled, true);
  });

  it('persisted false → Inactive immediate', () => {
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
    });
    assert.equal(h.phase, 'inactive');
    assert.equal(h.displayActive, false);
    assert.equal(h.runtimeEligible, false);
  });

  it('persisted true + validating → provisional Active, no runtime', () => {
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: true,
    });
    assert.equal(h.phase, 'validating');
    assert.equal(h.displayActive, true);
    assert.equal(h.runtimeEligible, false);
    assert.equal(h.toggleDisabled, true);
  });

  it('persisted true + valid perms → Active + runtime', () => {
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: true,
    });
    assert.equal(h.phase, 'active');
    assert.equal(h.displayActive, true);
    assert.equal(h.runtimeEligible, true);
  });

  it('persisted true + invalid perms → deactivate + Inactive', () => {
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: false,
    });
    assert.equal(h.phase, 'inactive');
    assert.equal(h.displayActive, false);
    assert.equal(h.shouldDeactivate, true);
    assert.equal(h.runtimeEligible, false);
  });

  it('CRJ/Home: visibility false→true clears sticky permissionsValid=false', () => {
    assert.equal(
      shouldResetPermissionValidationOnVisibilityChange(false, true),
      true,
    );
    assert.equal(
      shouldResetPermissionValidationOnVisibilityChange(undefined, true),
      true,
    );
    assert.equal(
      shouldResetPermissionValidationOnVisibilityChange(true, true),
      false,
    );
    assert.equal(
      shouldResetPermissionValidationOnVisibilityChange(true, false),
      false,
    );
  });

  it('sticky false + Visibility true would render Inactive until reset', () => {
    const sticky = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: false,
    });
    assert.equal(sticky.displayActive, false);

    const afterReset = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: true,
      permissionsValid: undefined,
    });
    assert.equal(afterReset.phase, 'validating');
    assert.equal(afterReset.displayActive, true);

    const afterFgOk = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: true,
    });
    assert.equal(afterFgOk.displayActive, true);
    assert.equal(afterFgOk.runtimeEligible, true);
  });

  it('BUG-VIS-01: cached false→true snapshot clears sticky before paint', () => {
    // Simulated Home permission state after cached visibility:false snapshot.
    let permissionsValid: boolean | undefined = false;
    let permissionValidationPending = false;
    let previousVisibility: boolean | undefined = false;

    const cachedFalse = resolvePermissionValidationOnVisibilitySnapshot({
      previousVisibility: undefined,
      nextVisibility: false,
    });
    assert.deepEqual(cachedFalse, {
      permissionsValid: false,
      permissionValidationPending: false,
    });
    permissionsValid = cachedFalse!.permissionsValid;
    permissionValidationPending = cachedFalse!.permissionValidationPending;
    previousVisibility = false;

    const rising = resolvePermissionValidationOnVisibilitySnapshot({
      previousVisibility,
      nextVisibility: true,
    });
    assert.deepEqual(rising, {
      permissionsValid: undefined,
      permissionValidationPending: true,
    });
    permissionsValid = rising!.permissionsValid;
    permissionValidationPending = rising!.permissionValidationPending;

    const afterEdge = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending,
      permissionsValid,
    });
    assert.equal(afterEdge.phase, 'validating');
    assert.equal(afterEdge.displayActive, true);
    assert.equal(afterEdge.runtimeEligible, false);
    assert.notEqual(afterEdge.phase, 'inactive');
  });

  it('BUG-VIS-01: stable false stays Inactive; no rising-edge patch on true→true', () => {
    assert.deepEqual(
      resolvePermissionValidationOnVisibilitySnapshot({
        previousVisibility: false,
        nextVisibility: false,
      }),
      {
        permissionsValid: false,
        permissionValidationPending: false,
      },
    );
    assert.equal(
      resolvePermissionValidationOnVisibilitySnapshot({
        previousVisibility: true,
        nextVisibility: true,
      }),
      null,
    );
  });

  it('BUG-VIS-01: denied / invalid perms → Inactive; BG Not now irrelevant to pill', () => {
    const denied = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: false,
    });
    assert.equal(denied.displayActive, false);
    assert.equal(denied.runtimeEligible, false);
    assert.equal(denied.shouldDeactivate, true);

    // Hydration inputs have no bgVisible — Always vs Not now cannot flip the pill.
    const provisional = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: true,
      permissionsValid: undefined,
    });
    assert.equal(provisional.displayActive, true);
    assert.equal(provisional.runtimeEligible, false);
  });

  it('BUG-VIS-01: reinstall/existing account undefined→true is provisional Active', () => {
    const patch = resolvePermissionValidationOnVisibilitySnapshot({
      previousVisibility: undefined,
      nextVisibility: true,
    });
    assert.deepEqual(patch, {
      permissionsValid: undefined,
      permissionValidationPending: true,
    });
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: true,
      permissionsValid: undefined,
    });
    assert.equal(h.displayActive, true);
    assert.equal(h.runtimeEligible, false);
  });

  it('BUG-VIS-01: CRJ success + cached false → Active provisional, no search/runtime', () => {
    clearCrjVisibilityProvisionalActive();
    markCrjVisibilityProvisionalActive('uid-crj');
    assert.equal(peekCrjVisibilityProvisionalActive('uid-crj'), true);
    const consumed = consumeCrjVisibilityProvisionalActive('uid-crj');
    assert.equal(consumed, true);
    assert.equal(peekCrjVisibilityProvisionalActive('uid-crj'), false);

    // Cached false must not sticky-invalidate under CRJ provisional.
    assert.equal(
      resolvePermissionValidationOnVisibilitySnapshot({
        previousVisibility: undefined,
        nextVisibility: false,
        crjActivationProvisional: true,
      }),
      null,
    );

    const delayedTrue = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: true,
      permissionsValid: undefined,
      crjActivationProvisional: true,
    });
    assert.equal(delayedTrue.phase, 'validating');
    assert.equal(delayedTrue.displayActive, true);
    assert.equal(delayedTrue.runtimeEligible, false);
    assert.equal(
      isHomeSearchEnabled({
        displayActive: delayedTrue.displayActive,
        permissionsValid: undefined,
      }),
      false,
    );

    // Still waiting for remote true — remains provisional Active.
    const stillWaiting = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: true,
      permissionsValid: undefined,
      crjActivationProvisional: true,
    });
    assert.equal(stillWaiting.displayActive, true);
    assert.equal(stillWaiting.runtimeEligible, false);

    // Remote true + FG ok → confirmed Active + search.
    const confirmed = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: true,
      crjActivationProvisional: true,
    });
    assert.equal(confirmed.phase, 'active');
    assert.equal(confirmed.displayActive, true);
    assert.equal(confirmed.runtimeEligible, true);
    assert.equal(
      isHomeSearchEnabled({
        displayActive: confirmed.displayActive,
        permissionsValid: true,
      }),
      true,
    );
  });

  it('BUG-VIS-01: CRJ provisional + FG denied → Inactive', () => {
    const denied = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      permissionsValid: false,
      crjActivationProvisional: true,
    });
    assert.equal(denied.displayActive, false);
    assert.equal(denied.runtimeEligible, false);
    assert.equal(
      isHomeSearchEnabled({
        displayActive: denied.displayActive,
        permissionsValid: false,
      }),
      false,
    );
  });

  it('BUG-VIS-01: no CRJ signal + visibility false → Inactive from start', () => {
    clearCrjVisibilityProvisionalActive();
    assert.equal(consumeCrjVisibilityProvisionalActive('uid-off'), false);
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      permissionsValid: false,
      crjActivationProvisional: false,
    });
    assert.equal(h.phase, 'inactive');
    assert.equal(h.displayActive, false);
    assert.equal(h.runtimeEligible, false);
  });

  it('BUG-VIS-01: consumed CRJ signal + remount visibility false → Inactive', () => {
    clearCrjVisibilityProvisionalActive();
    markCrjVisibilityProvisionalActive('uid-once');
    assert.equal(consumeCrjVisibilityProvisionalActive('uid-once'), true);
    // Second mount / remount — no sticky Active.
    assert.equal(consumeCrjVisibilityProvisionalActive('uid-once'), false);
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      permissionsValid: false,
      crjActivationProvisional: false,
    });
    assert.equal(h.displayActive, false);
  });

  it('BUG-VIS-01: existing account/reinstall never auto-marks CRJ provisional', () => {
    clearCrjVisibilityProvisionalActive();
    assert.equal(peekCrjVisibilityProvisionalActive('uid-reinstall'), false);
    const h = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      permissionsValid: false,
    });
    assert.equal(h.displayActive, false);
  });

  it('BUG-VIS-01: repeated true snapshot + provisional clear does not sticky-invalidate', () => {
    let previous: boolean | undefined = true;
    assert.equal(
      resolvePermissionValidationOnVisibilitySnapshot({
        previousVisibility: previous,
        nextVisibility: true,
        crjActivationProvisional: false,
      }),
      null,
    );
    // bgVisible is not an input — churn cannot force revalidation via this helper.
    previous = true;
    assert.equal(
      resolvePermissionValidationOnVisibilitySnapshot({
        previousVisibility: previous,
        nextVisibility: true,
      }),
      null,
    );
  });

  it('BUG-VIS-01: CRJ mark is uid-scoped; logout clear drops pending', () => {
    clearCrjVisibilityProvisionalActive();
    markCrjVisibilityProvisionalActive('a');
    assert.equal(peekCrjVisibilityProvisionalActive('b'), false);
    assert.equal(peekCrjVisibilityProvisionalActive('a'), true);
    resetLocationJourneySession();
    assert.equal(peekCrjVisibilityProvisionalActive('a'), false);
  });
});

describe('backgroundPublishDisposition', () => {
  it('permanent auth / App Check / visibility-inactive → stop', () => {
    assert.equal(
      disposeBackgroundPublishFailure({ code: 'unauthenticated' }),
      'stop',
    );
    assert.equal(
      disposeBackgroundPublishFailure({ code: 'permission-denied' }),
      'stop',
    );
    assert.equal(
      disposeBackgroundPublishFailure({
        code: 'failed-precondition',
        message: 'App Check token was rejected by the backend.',
      }),
      'stop',
    );
    assert.equal(
      disposeBackgroundPublishFailure({
        reason: 'visibility-inactive',
        retryable: false,
      }),
      'stop',
    );
    assert.equal(
      disposeBackgroundPublishFailure({ kind: 'permission-denied' }),
      'stop',
    );
  });

  it('transient sample / network → skip', () => {
    assert.equal(
      disposeBackgroundPublishFailure({ kind: 'invalid-accuracy' }),
      'skip',
    );
    assert.equal(
      disposeBackgroundPublishFailure({ kind: 'unavailable' }),
      'skip',
    );
    assert.equal(
      disposeBackgroundPublishFailure({
        code: 'unavailable',
        retryable: true,
      }),
      'skip',
    );
  });

  it('headless ready requires Auth + App Check ready', () => {
    assert.equal(
      isHeadlessPublishEnvironmentReady({
        hasCurrentUser: true,
        appCheckStatus: 'ready',
      }),
      true,
    );
    assert.equal(
      isHeadlessPublishEnvironmentReady({
        hasCurrentUser: false,
        appCheckStatus: 'ready',
      }),
      false,
    );
    assert.equal(
      isHeadlessPublishEnvironmentReady({
        hasCurrentUser: true,
        appCheckStatus: 'pending',
      }),
      false,
    );
  });
});

describe('backgroundRuntimeAuth callback gate', () => {
  const auth: BackgroundRuntimeAuth = {
    uid: 'u1',
    allowedAt: 1,
    visibility: true,
    bgVisible: true,
  };

  it('publishes when auth UID + runtime auth + perms align', () => {
    assert.equal(
      decideCallbackPublication({
        authUid: 'u1',
        storedTaskUid: 'u1',
        runtimeAuth: auth,
        foregroundGranted: true,
        backgroundGranted: true,
      }),
      'publish',
    );
  });

  it('auth UID mismatch → stop', () => {
    assert.equal(
      decideCallbackPublication({
        authUid: 'u2',
        storedTaskUid: 'u1',
        runtimeAuth: auth,
        foregroundGranted: true,
        backgroundGranted: true,
      }),
      'stop',
    );
  });

  it('missing runtime auth → stop (no Firestore profile read required)', () => {
    assert.equal(
      decideCallbackPublication({
        authUid: 'u1',
        storedTaskUid: 'u1',
        runtimeAuth: null,
        foregroundGranted: true,
        backgroundGranted: true,
      }),
      'stop',
    );
  });

  it('callback stop when fineLocationGranted is false', () => {
    assert.equal(
      decideCallbackPublication({
        authUid: 'u1',
        storedTaskUid: 'u1',
        runtimeAuth: auth,
        foregroundGranted: true,
        fineLocationGranted: false,
        backgroundGranted: true,
      }),
      'stop',
    );
  });

  it('permission revoked → stop', () => {
    assert.equal(
      decideCallbackPublication({
        authUid: 'u1',
        storedTaskUid: 'u1',
        runtimeAuth: auth,
        foregroundGranted: true,
        backgroundGranted: false,
      }),
      'stop',
    );
  });
});

describe('ENH-LOC-01 source contracts', () => {
  it('locationTask uses runtime auth + publishLocation — no client users merge', () => {
    const src = readShared('background/locationTask.android.ts');
    assert.match(src, /decideCallbackPublication/);
    assert.match(src, /readBackgroundRuntimeAuth/);
    assert.match(src, /firebaseAuth\.currentUser/);
    assert.match(src, /publishLocationFlow/);
    assert.match(src, /isHeadlessPublishEnvironmentReady/);
    assert.match(src, /disposeBackgroundPublishFailure/);
    assert.match(src, /ensureAppCheckInitialized/);
    assert.match(src, /visibility-inactive/);
    assert.doesNotMatch(src, /\.collection\(['\"]users['\"]\)/);
    assert.doesNotMatch(src, /legacy direct Firestore merge/i);
    assert.doesNotMatch(src, /lastBgUpdateAt/);
    assert.doesNotMatch(src, /firestoreDb/);
    assert.doesNotMatch(src, /\.collection\('users'\)[\s\S]*\.get\(\)/);
    assert.doesNotMatch(src, /decideBackgroundPublication/);
  });

  it('App bootstrap marks post-login recovery; gated start needs visibility+bgVisible', () => {
    const src = readShared('App.tsx');
    assert.match(src, /markPostLoginLocationRecoveryNeeded/);
    assert.match(src, /startGatedBackgroundLocation/);
    assert.match(src, /bindLocationJourneySessionUid/);
    assert.match(src, /resetLocationJourneySession/);
    assert.doesNotMatch(
      src,
      /if \(bgVisible\) \{\s*await startBackgroundLocation/,
    );
  });

  it('FGS notification copy no longer claims only while using the app', () => {
    const src = readShared('services/backgroundLocation.ts');
    assert.doesNotMatch(src, /while you use the app/);
    assert.match(src, /while Visibility is on/);
  });

  it('disclosure + preparation EN/ES keys exist', () => {
    const en = readShared('i18n/resources/settings.ts');
    const es = readShared('i18n/locales/es.ts');
    assert.match(en, /education:\s*\{/);
    assert.match(en, /Stay discoverable nearby/);
    assert.match(en, /Allow all the time/);
    assert.match(en, /Background updates are off/);
    assert.match(es, /Mantente visible cerca/);
    assert.match(es, /Permitir todo el tiempo/);
    assert.match(es, /Actualizaciones en segundo plano desactivadas/);
    assert.doesNotMatch(en, /iPhone/);
    assert.doesNotMatch(es, /iPhone/);
  });

  it('CRJ offers education after FG grant via local reducer', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(src, /BackgroundLocationDisclosureModal/);
    assert.match(src, /finishCrjBackgroundDisclosure/);
    assert.match(src, /reduceCrjLocationStep/);
    assert.doesNotMatch(src, /LocationPreparationModal/);
  });

  it('More/Home use gated start and disclosure', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(more, /startGatedBackgroundLocation/);
    assert.match(more, /BackgroundLocationDisclosureModal/);
    assert.match(more, /runContractualAndroidLogout/);
    assert.match(more, /shouldReconcileBgPreferenceOff/);
    assert.match(more, /disabledDone/);
    assert.match(home, /startGatedBackgroundLocation/);
    assert.match(home, /offerBackgroundEducationIfNeeded/);
    assert.match(home, /isVisibilityToggleDisabled/);
    assert.match(home, /shouldResetPermissionValidationOnVisibilityChange/);
    assert.match(home, /resolvePermissionValidationOnVisibilitySnapshot/);
    assert.match(home, /previousVisibilityRef\.current = nextVisibility/);
    assert.match(home, /consumeCrjVisibilityProvisionalActive/);
    assert.match(home, /crjActivationProvisional/);
    assert.match(home, /isHomeSearchEnabled/);
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /markCrjVisibilityProvisionalActive/);
  });

  it('startGated sets runtime auth; stop clears it', () => {
    const src = readShared('location/startGatedBackgroundLocation.ts');
    assert.match(src, /setBackgroundRuntimeAuth/);
    assert.match(src, /clearBackgroundRuntimeAuth/);
  });
});
