/**
 * ENH-LOC-01 — background publication gates + education storage + Android policy.
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

describe('ENH-LOC-01 source contracts', () => {
  it('locationTask re-validates visibility/bgVisible before publish', () => {
    const src = readShared('background/locationTask.android.ts');
    assert.match(src, /decideBackgroundPublication/);
    assert.match(src, /visibility/);
    assert.match(src, /bgVisible/);
    assert.match(src, /stopTaskCleanly/);
    assert.match(src, /visibility-inactive/);
    assert.match(src, /firebaseAuth\.currentUser/);
    assert.match(src, /profile read error/);
  });

  it('App bootstrap requires visibility AND bgVisible', () => {
    const src = readShared('App.tsx');
    assert.match(src, /bgVisible && visibility/);
    assert.match(src, /startGatedBackgroundLocation/);
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

  it('disclosure EN/ES keys exist', () => {
    const en = readShared('i18n/resources/settings.ts');
    const es = readShared('i18n/locales/es.ts');
    assert.match(en, /disclosure:\s*\{/);
    assert.match(en, /fullTitle:/);
    assert.match(en, /notNow:/);
    assert.match(es, /disclosure:\s*\{/);
    assert.match(es, /Ahora no/);
  });

  it('CRJ offers disclosure after FG grant', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(src, /BackgroundLocationDisclosureModal/);
    assert.match(src, /finishCrjBackgroundDisclosure/);
    assert.match(src, /resolveBackgroundDisclosureVariant/);
  });

  it('More/Home use gated start and disclosure', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(more, /startGatedBackgroundLocation/);
    assert.match(more, /BackgroundLocationDisclosureModal/);
    assert.match(more, /runContractualAndroidLogout/);
    assert.match(more, /shouldReconcileBgPreferenceOff/);
    assert.match(home, /startGatedBackgroundLocation/);
    assert.match(home, /maybeOfferBackgroundDisclosure/);
  });
});
