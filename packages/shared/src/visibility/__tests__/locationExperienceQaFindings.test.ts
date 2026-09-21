/**
 * ENH-LOC-01 Owner QA findings — preparation, reinstall, hydration.
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
  markSessionBackgroundEducationOffered,
  shouldContinueToBackgroundEducation,
  shouldShowLocationPreparation,
} from '../locationPermissionJourney';
import { resolveVisibilityPresentation } from '../visibilityPresentation';
import {
  decideBackgroundEducationOffer,
  hasSeenFullBackgroundEducation,
  resolveBackgroundEducationVariant,
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

beforeEach(() => {
  clearLocationPermissionJourneySession();
});

describe('ENH-LOC-01 preparation modal decisions', () => {
  it('1–3: FG granted + pending work → show prep; FG denied → no prep', () => {
    assert.equal(
      shouldShowLocationPreparation({
        foregroundGranted: true,
        willRunActivationWork: true,
      }),
      true,
    );
    assert.equal(
      shouldShowLocationPreparation({
        foregroundGranted: false,
        willRunActivationWork: true,
      }),
      false,
    );
    assert.equal(
      shouldShowLocationPreparation({
        foregroundGranted: true,
        willRunActivationWork: false,
      }),
      false,
    );
  });

  it('4–5: education after FG grant even when activation fails; not without FG', () => {
    assert.equal(
      shouldContinueToBackgroundEducation({
        foregroundGranted: true,
        foregroundNewlyGranted: true,
        requireNewlyGranted: true,
        uid: 'u1',
        alreadyOfferedThisSession: false,
      }),
      true,
    );
    assert.equal(
      shouldContinueToBackgroundEducation({
        foregroundGranted: false,
        foregroundNewlyGranted: false,
        requireNewlyGranted: true,
        uid: 'u1',
        alreadyOfferedThisSession: false,
      }),
      false,
    );
  });

  it('journey mutex blocks concurrent journeys; end releases', () => {
    const a = beginLocationPermissionJourney('u1', 'crj');
    assert.ok(a);
    assert.equal(beginLocationPermissionJourney('u1', 'home-activate'), null);
    endLocationPermissionJourney(a);
    assert.ok(beginLocationPermissionJourney('u1', 'home-activate'));
  });
});

describe('ENH-LOC-01 reinstall / education session', () => {
  it('8: reinstall simulation — education flag absent → full education', async () => {
    const storage = memoryStorage(); // wiped install
    assert.equal(await hasSeenFullBackgroundEducation(storage), false);
    assert.equal(await resolveBackgroundEducationVariant(storage), 'full');
    const offer = await decideBackgroundEducationOffer({
      storage,
      backgroundGranted: false,
      bgVisible: false,
    });
    assert.equal(offer.offer, true);
    if (offer.offer) assert.equal(offer.variant, 'full');
  });

  it('11: session guard prevents duplicate education in same session', () => {
    assert.equal(hasSessionBackgroundEducationOffered('u1'), false);
    markSessionBackgroundEducationOffered('u1');
    assert.equal(
      shouldContinueToBackgroundEducation({
        foregroundGranted: true,
        foregroundNewlyGranted: true,
        requireNewlyGranted: true,
        uid: 'u1',
        alreadyOfferedThisSession: hasSessionBackgroundEducationOffered('u1'),
      }),
      false,
    );
  });

  it('19: account switch clears session education guard', () => {
    markSessionBackgroundEducationOffered('A');
    clearLocationPermissionJourneySession();
    assert.equal(hasSessionBackgroundEducationOffered('A'), false);
  });
});

describe('ENH-LOC-01 Visibility presentation hydration', () => {
  it('13–14: persisted true → Active during validation; stays Active when valid', () => {
    const pending = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(pending.visualActive, true);
    assert.equal(pending.canStartRuntime, false);
    assert.equal(pending.allowToggle, false);

    const valid = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
    });
    assert.equal(valid.visualActive, true);
    assert.equal(valid.canStartRuntime, true);
  });

  it('15: validation invalid → Inactive after conclude', () => {
    const invalid = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(invalid.visualActive, false);
    assert.equal(invalid.canStartRuntime, false);
  });

  it('16: persisted false → Inactive immediate', () => {
    const off = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(off.visualActive, false);
  });

  it('17: profile unknown → neutral, not false flicker', () => {
    const unknown = resolveVisibilityPresentation({
      profileLoaded: false,
      persistedVisibility: undefined,
      validationPending: false,
      validatedEffective: null,
    });
    assert.equal(unknown.visualActive, null);
    assert.equal(unknown.canStartRuntime, false);
  });

  it('18: optimistic visual Active never enables runtime', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);
  });
});

describe('ENH-LOC-01 wiring contracts', () => {
  it('6–7: CRJ goes FG → education with no preparation modal; Home still prepares', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.doesNotMatch(crj, /LocationPreparingModal/);
    assert.doesNotMatch(crj, /setLocationPreparing\(true\)/);
    assert.match(crj, /FG_GRANTED/);
    assert.match(crj, /BackgroundLocationEducationModal/);
    assert.doesNotMatch(crj, /beginLocationPermissionJourney\(uid, 'crj'\)/);
  });

  it('Home recovery + activate use preparation and presentation hydration', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /resolveVisibilityPresentation/);
    assert.match(home, /LocationPreparingModal/);
    assert.match(home, /home-recovery/);
    assert.match(home, /visualActive/);
    assert.match(home, /setVisibilityValidationPending\(true\)/);
    assert.match(home, /allowToggle/);
    // During preserve-intent, do not immediately flip local visibility OFF before FG attempt.
    const preserveSlice = home.slice(
      home.indexOf("decision.action === 'preserve-intent-then-deactivate'"),
      home.indexOf("decision.action === 'activate-from-intent'"),
    );
    assert.match(preserveSlice, /Stop runtime only/);
    assert.match(preserveSlice, /runPostGrantRestore/);
  });

  it('20: preparing EN/ES keys + modal theme', () => {
    const en = readShared('i18n/resources/settings.ts');
    assert.match(en, /preparing:\s*\{/);
    assert.match(en, /Almost there!/);
    const es = readShared('i18n/locales/es.ts');
    assert.match(es, /¡Ya casi!/);
    assert.match(es, /Estamos preparando tu ubicación/);
    const modal = readShared('components/LocationPreparingModal.tsx');
    assert.match(modal, /useAppTheme/);
    assert.match(modal, /ActivityIndicator/);
    assert.match(modal, /accessibilityState=\{\{ busy: true \}\}/);
  });

  it('App clears journey session on logout / account switch', () => {
    const app = readShared('App.tsx');
    assert.match(app, /clearLocationPermissionJourneySession/);
  });
});
