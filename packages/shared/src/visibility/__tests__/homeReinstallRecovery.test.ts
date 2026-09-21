/**
 * ENH-LOC-01 — Home automatic recovery after reinstall (existing account).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideBackgroundEducationOffer,
  hasSeenFullBackgroundEducation,
  type EducationStorage,
} from '../locationEducation';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', '..', rel), 'utf8');
}

function memoryStorage(initial: Record<string, string> = {}): EducationStorage {
  const map = new Map(Object.entries(initial));
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

describe('Home reinstall recovery — education + no ghost overlay', () => {
  it('reinstall (education mark absent) forces education even if Always granted', async () => {
    const storage = memoryStorage();
    assert.equal(await hasSeenFullBackgroundEducation(storage), false);
    // decideBackgroundEducationOffer alone would skip when BG granted — Home
    // must not use that skip when the reinstall mark is absent.
    const skipped = await decideBackgroundEducationOffer({
      storage,
      backgroundGranted: true,
      bgVisible: false,
    });
    assert.equal(skipped.offer, false);

    const home = readShared('screens/MainHomeScreen.tsx');
    const offer = home.slice(
      home.indexOf('offerBackgroundEducationIfNeeded'),
      home.indexOf('const activateVisibility'),
    );
    assert.match(offer, /fullSeen/);
    assert.match(offer, /setBgEducationVariant\('full'\)/);
    assert.match(offer, /setBgEducationOpen\(true\)/);
    assert.match(offer, /setLocationPreparing\(false\)/);
  });

  it('Home recovery does not open preparation between FG and education', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const restore = home.slice(
      home.indexOf('runPostGrantRestore'),
      home.indexOf("decision.action === 'preserve-intent-then-deactivate'"),
    );
    assert.doesNotMatch(restore, /setLocationPreparing\(true\)/);
    assert.match(restore, /setLocationPreparing\(false\)/);
    assert.match(restore, /offerBackgroundEducationIfNeeded/);
    assert.match(restore, /No preparation modal/);
  });

  it('focus recovery does not remount on profile.visibility / bgVisible churn', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const focus = home.slice(
      home.indexOf('useFocusEffect('),
      home.indexOf('const showVisibilityError'),
    );
    assert.doesNotMatch(
      focus,
      /}, \[profile\.visibility, profile\.bgVisible, loading\]\)/,
    );
    assert.match(focus, /}, \[loading\]\)/);
    assert.match(focus, /snapshot churn must not/);
  });

  it('modals unmount when not visible (no invisible touch interceptor)', () => {
    const prep = readShared('components/LocationPreparingModal.tsx');
    const edu = readShared('components/BackgroundLocationEducationModal.tsx');
    assert.match(prep, /visible \? \(/);
    assert.match(prep, /\) : null/);
    assert.match(edu, /visible \? \(/);
    assert.match(edu, /\) : null/);
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(
      home,
      /BackgroundLocationEducationModal[\s\S]*visible=\{bgEducationOpen\}/,
    );
    assert.doesNotMatch(
      home,
      /visible=\{bgEducationOpen && !locationPreparing\}/,
    );
  });

  it('Not now / Enable paths clear education and stay Settings-free', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const enable = home.slice(
      home.indexOf('handleHomeEnableBackground'),
      home.indexOf('handleHomeBackgroundNotNow'),
    );
    assert.match(enable, /foreground-only, no Settings/);
    assert.doesNotMatch(enable, /needsAlwaysPermission/);
    assert.match(enable, /closeBgEducation/);
    const notNow = home.slice(
      home.indexOf('handleHomeBackgroundNotNow'),
      home.indexOf('offerBackgroundEducationIfNeeded'),
    );
    assert.match(notNow, /bgVisible: false/);
    assert.match(notNow, /closeBgEducation/);
  });

  it('CRJ simplified Location flow is unchanged (no shared recovery)', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /reduceCrjLocationStep|FG_GRANTED/);
    assert.doesNotMatch(crj, /beginLocationPermissionJourney/);
    assert.doesNotMatch(crj, /setLocationPreparing\(true\)/);
    assert.doesNotMatch(crj, /home-recovery/);
  });
});
