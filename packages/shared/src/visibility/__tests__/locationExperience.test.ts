/**
 * ENH-LOC-01 — Location Experience (FG → education → optional Always).
 * Pure helpers only — avoid importing RN/Expo modules in node:test.
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

/** Mirrors shouldRunBackgroundLocationRuntime (pure gate). */
function shouldRunBackgroundLocationRuntime(gates: {
  uid: string | null | undefined;
  visibilityOn: boolean;
  bgVisible: boolean;
}): boolean {
  return (
    typeof gates.uid === 'string' &&
    gates.uid.length > 0 &&
    gates.visibilityOn === true &&
    gates.bgVisible === true
  );
}

function wasForegroundNewlyGranted(input: {
  beforeGranted: boolean;
  afterGranted: boolean;
}): boolean {
  return !input.beforeGranted && input.afterGranted;
}

function isSessionOnlyGrant(expires: unknown): boolean {
  return expires !== 'never';
}

describe('ENH-LOC-01 runtime gates', () => {
  it('requires auth + visibility + bgVisible', () => {
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
        uid: null,
        visibilityOn: true,
        bgVisible: true,
      }),
      false,
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

    const runtime = readShared('visibility/backgroundLocationRuntime.ts');
    assert.match(runtime, /visibilityOn === true/);
    assert.match(runtime, /bgVisible === true/);
  });

  it('treats Allow Once / session grant separately from durable Always', () => {
    assert.equal(isSessionOnlyGrant('never'), false);
    assert.equal(isSessionOnlyGrant('session'), true);
    assert.equal(isSessionOnlyGrant(undefined), true);
    const runtime = readShared('visibility/backgroundLocationRuntime.ts');
    assert.match(runtime, /isSessionOnlyGrant/);
    assert.match(runtime, /sessionOnly/);
  });

  it('detects first-time foreground grant', () => {
    assert.equal(
      wasForegroundNewlyGranted({ beforeGranted: false, afterGranted: true }),
      true,
    );
    assert.equal(
      wasForegroundNewlyGranted({ beforeGranted: true, afterGranted: true }),
      false,
    );
    assert.equal(
      wasForegroundNewlyGranted({ beforeGranted: false, afterGranted: false }),
      false,
    );
  });
});

describe('ENH-LOC-01 education persistence (local only)', () => {
  it('full first-time then brief on retry; never Firestore', async () => {
    const storage = memoryStorage();
    assert.equal(await hasSeenFullBackgroundEducation(storage), false);
    assert.equal(await resolveBackgroundEducationVariant(storage), 'full');
    await markFullBackgroundEducationSeen(storage);
    assert.equal(await hasSeenFullBackgroundEducation(storage), true);
    assert.equal(await resolveBackgroundEducationVariant(storage), 'brief');
    assert.equal(BG_LOCATION_EDUCATION_FULL_SEEN_KEY.startsWith('NEARSY_'), true);

    const eduSrc = readShared('visibility/locationEducation.ts');
    assert.doesNotMatch(eduSrc, /setDoc|getDoc|firestoreDb/);
  });

  it('skips education when Always already granted/configured', async () => {
    const storage = memoryStorage();
    assert.deepEqual(
      await decideBackgroundEducationOffer({
        storage,
        backgroundGranted: true,
        bgVisible: true,
      }),
      { offer: false, reason: 'already-configured' },
    );
    assert.deepEqual(
      await decideBackgroundEducationOffer({
        storage,
        backgroundGranted: true,
        bgVisible: false,
      }),
      { offer: false, reason: 'background-granted' },
    );
    const offer = await decideBackgroundEducationOffer({
      storage,
      backgroundGranted: false,
      bgVisible: false,
    });
    assert.equal(offer.offer, true);
    if (offer.offer) assert.equal(offer.variant, 'full');
  });
});

describe('ENH-LOC-01 CRJ / Home / More contracts', () => {
  it('1–3: FG denied keeps Visibility off path; FG grant offers education; Not now keeps FG', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /requestForegroundPermissionsAsync/);
    assert.match(crj, /setCrjVisibilityOn\(false\)/);
    assert.match(crj, /BackgroundLocationEducationModal/);
    assert.match(crj, /handleCrjBackgroundNotNow/);
    assert.match(crj, /Do not undo foreground or Visibility/);
    assert.match(crj, /requestAndApplyBackgroundLocation/);

    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /wasForegroundNewlyGranted/);
    assert.match(home, /offerBackgroundEducationIfNeeded/);
    assert.match(home, /handleHomeBackgroundNotNow/);
    assert.match(home, /BackgroundLocationEducationModal/);
  });

  it('4–6: BG + Visibility gates; Visibility OFF stops runtime even if bgVisible', () => {
    const runtime = readShared('visibility/backgroundLocationRuntime.ts');
    assert.match(runtime, /stopBackgroundLocation/);

    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /stopBackgroundLocationRuntime/);
    assert.match(home, /deactivateVisibilityFlow/);

    const task = readShared('background/locationTask.ios.ts');
    assert.match(task, /NEARSY_BG_RUNTIME_ALLOWED/);
    assert.match(task, /publish blocked/);
  });

  it('7–9: More ON educates / Settings return; More OFF stops task', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /BackgroundLocationEducationModal/);
    assert.match(more, /requestAndApplyBackgroundLocation/);
    assert.match(more, /stopBackgroundLocationRuntime/);
    assert.match(more, /evaluateBackgroundLocationSettingsReturn/);
    assert.match(more, /offerMoreBackgroundEducation/);
    assert.match(more, /showNeedsAlwaysSettings/);
    assert.match(more, /Linking\.openSettings/);
    assert.match(more, /Keep toggle visually OFF until enable succeeds/);
  });

  it('10–12: logout stops task; account switch uses runtime uid gate; revoked BG stops', () => {
    const more = readShared('screens/MoreScreen.tsx');
    assert.match(more, /deactivateVisibilityFlow/);
    assert.match(more, /stopBackgroundLocationRuntime/);
    assert.match(more, /firebaseAuth\.signOut/);

    const app = readShared('App.tsx');
    assert.match(app, /stopBackgroundLocationRuntime/);
    assert.match(app, /syncBackgroundLocationRuntime/);

    const runtime = readShared('visibility/backgroundLocationRuntime.ts');
    assert.match(runtime, /NEARSY_BG_RUNTIME_ALLOWED/);
    assert.match(runtime, /readBackgroundRuntimeAllowedUid/);
    assert.match(runtime, /!fg\.granted \|\| !bg\.granted/);
  });

  it('13–14: Allow Once helpers + accuracy recovery copy exist', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /invalid-accuracy/);
    assert.match(home, /accuracyTitle/);
    assert.match(home, /accuracyMessage/);

    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /invalid-accuracy/);
  });

  it('15–16: education EN/ES keys and modal Light/Dark via theme', () => {
    const en = readShared('i18n/resources/settings.ts');
    assert.match(en, /education:\s*\{/);
    assert.match(en, /enableBackground:/);
    assert.match(en, /notNow:/);
    assert.match(en, /controlNote:/);
    assert.match(en, /Stay discoverable nearby/);

    const es = readShared('i18n/locales/es.ts');
    assert.match(es, /education:\s*\{/);
    assert.match(es, /Activar ubicación en segundo plano/);
    assert.match(es, /Ahora no/);
    assert.match(es, /Sigue siendo visible cerca/);

    const modal = readShared('components/BackgroundLocationEducationModal.tsx');
    assert.match(modal, /useAppTheme/);
    assert.match(modal, /palette\.surface/);
    assert.doesNotMatch(modal, /#6200EE|#F4F1EA/);
  });
});

describe('ENH-LOC-01 native config intact', () => {
  it('keeps Info.plist location strings and does not alter TTL', () => {
    const appJson = readFileSync(
      join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-ios', 'app.json'),
      'utf8',
    );
    assert.match(appJson, /NSLocationWhenInUseUsageDescription/);
    assert.match(appJson, /NSLocationAlwaysAndWhenInUseUsageDescription/);
    assert.match(appJson, /NSLocationAlwaysUsageDescription/);
    assert.match(appJson, /"location"/);

    const constants = readShared('visibility/constants.ts');
    assert.match(constants, /LOCATION_TTL_MS = 3_600_000/);
  });
});
