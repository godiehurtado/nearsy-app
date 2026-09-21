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
import { evaluateVisibilityHydration } from '../visibilityHydration.ts';

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
  it('locationTask uses runtime auth — no profile get per tick', () => {
    const src = readShared('background/locationTask.android.ts');
    assert.match(src, /decideCallbackPublication/);
    assert.match(src, /readBackgroundRuntimeAuth/);
    assert.match(src, /firebaseAuth\.currentUser/);
    assert.match(src, /visibility-inactive/);
    assert.match(src, /legacy direct Firestore merge/i);
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
  });

  it('startGated sets runtime auth; stop clears it', () => {
    const src = readShared('location/startGatedBackgroundLocation.ts');
    assert.match(src, /setBackgroundRuntimeAuth/);
    assert.match(src, /clearBackgroundRuntimeAuth/);
  });
});
