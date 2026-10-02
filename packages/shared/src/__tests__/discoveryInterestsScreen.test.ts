/**
 * Discovery Profile interests moved to a read-only Interests screen (2.0.7).
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/discoveryInterestsScreen.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildDiscoveryInterestsParams,
  readDiscoveryInterestIds,
} from '../visibility/discoveryInterests.ts';
import {
  isDeprecatedInterestId,
  isSelectableCatalogInterestId,
  lookupInterestItemForDisplay,
} from '../interests/onboardingInterestLegacyCatalog.ts';
import discoveryProfileEn from '../i18n/resources/discoveryProfile.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '..');

function readShared(relative: string): string {
  return readFileSync(join(sharedSrc, relative), 'utf8').replace(/\r\n/g, '\n');
}

const SELECTABLE_A = 'business_entrepreneurship';
const SELECTABLE_B = 'business_networking';
const LEGACY = 'business_women_in_business';

/** Same per-ID resolution as resolveInterestChip (lookup → label/icon). */
function resolveChips(ids: readonly string[]) {
  return ids.flatMap((id) => {
    const item = lookupInterestItemForDisplay(id);
    return item
      ? [{ id, label: item.name, icon: item.icon, iconColor: item.iconColor }]
      : [];
  });
}

describe('Discovery interests entry params', () => {
  it('hides the entry when no interest resolves', () => {
    assert.equal(buildDiscoveryInterestsParams([]), null);
    assert.equal(buildDiscoveryInterestsParams(resolveChips([])), null);
    assert.equal(
      buildDiscoveryInterestsParams(resolveChips(['not_a_catalog_interest'])),
      null,
    );
  });

  it('passes only resolved catalog IDs, in profile order', () => {
    const chips = resolveChips([SELECTABLE_B, 'unknown_id', SELECTABLE_A]);
    const params = buildDiscoveryInterestsParams(chips);
    assert.deepEqual(params, { interestIds: [SELECTABLE_B, SELECTABLE_A] });
    assert.deepEqual(Object.keys(params ?? {}), ['interestIds']);
  });

  it('never carries labels, uid or other profile data', () => {
    const params = buildDiscoveryInterestsParams([
      { id: SELECTABLE_A, label: 'Soccer', uid: 'u1', displayName: 'Ana' } as any,
    ]);
    assert.deepEqual(params, { interestIds: [SELECTABLE_A] });
  });

  it('reads params defensively', () => {
    assert.deepEqual(readDiscoveryInterestIds({ interestIds: [SELECTABLE_A, LEGACY] }), [
      SELECTABLE_A,
      LEGACY,
    ]);
    assert.deepEqual(readDiscoveryInterestIds(undefined), []);
    assert.deepEqual(readDiscoveryInterestIds(null), []);
    assert.deepEqual(readDiscoveryInterestIds({}), []);
    assert.deepEqual(readDiscoveryInterestIds({ interestIds: 'x' }), []);
    assert.deepEqual(readDiscoveryInterestIds({ interestIds: [1, '', SELECTABLE_A] }), [
      SELECTABLE_A,
    ]);
  });
});

describe('Discovery interests legacy IDs', () => {
  it('fixtures cover a selectable and a deprecated ID', () => {
    assert.equal(isSelectableCatalogInterestId(SELECTABLE_A), true);
    assert.equal(isDeprecatedInterestId(LEGACY), true);
    assert.equal(isSelectableCatalogInterestId(LEGACY), false);
  });

  it('legacy IDs survive the navigation hop with the same display', () => {
    const profileIds = [LEGACY, SELECTABLE_A, 'unknown_id', SELECTABLE_B];
    const inline = resolveChips(profileIds);
    const params = buildDiscoveryInterestsParams(inline);
    assert.ok(params);
    assert.ok(params.interestIds.includes(LEGACY));
    const onInterestsScreen = resolveChips(readDiscoveryInterestIds(params));
    assert.deepEqual(onInterestsScreen, inline);
    assert.equal(onInterestsScreen[0].label, 'Women in Business');
  });
});

describe('DiscoveryProfileScreen composition', () => {
  const screen = readShared('screens/DiscoveryProfileScreen.tsx');

  it('no longer renders interest chips or the empty interests copy inline', () => {
    assert.doesNotMatch(screen, /<InterestChip|components\/InterestChip/);
    assert.doesNotMatch(screen, /pillsRow/);
    assert.doesNotMatch(screen, /discoveryProfile\.noInterests/);
  });

  it('reuses the existing resolver and shows the entry only when interests resolve', () => {
    assert.match(screen, /resolveInterestChips\(data\.profile\.interestIds, translateItem\)/);
    assert.match(screen, /buildDiscoveryInterestsParams\(interestPills\)/);
    assert.match(screen, /\{interestsParams \? \(\s*<Pressable/);
    assert.match(screen, /onPress=\{openInterests\}/);
    assert.match(screen, /t\('discoveryProfile\.viewInterests'\)/);
    assert.match(screen, /name="chevron-forward"/);
  });

  it('opens DiscoveryInterests with the loaded IDs (no second fetch, no uid)', () => {
    assert.match(screen, /navigation\.navigate\('DiscoveryInterests', interestsParams\)/);
    assert.equal(screen.match(/getDiscoveryProfile\(/g)?.length, 1);
  });

  it('keeps Bio → Affiliations → Interests entry → Photos', () => {
    const bio = screen.indexOf('discoveryProfile.biography');
    const aff = screen.indexOf('<DiscoveryAffiliationsCard');
    const interests = screen.indexOf("t('discoveryProfile.interests')");
    const photos = screen.indexOf('{/* 6. Photos');
    assert.ok(bio > 0);
    assert.ok(aff > bio);
    assert.ok(interests > aff);
    assert.ok(photos > interests);
  });

  it('leaves profile info, Affiliations, Photos and Block untouched', () => {
    assert.match(screen, /shouldShowOccupation\(profile\.occupation\)/);
    assert.match(screen, /shouldShowCompany\(mode, profile\.company\)/);
    assert.match(screen, /shouldShowBio\(profile\.bio\)/);
    assert.match(screen, /<DiscoveryAffiliationsCard affiliations=\{data\.affiliations\} \/>/);
    assert.match(screen, /<DiscoverySocialMediaRow links=\{publicSocialLinks\} \/>/);
    assert.match(screen, /openGallery\(0\)/);
    assert.match(screen, /openGallery\(index\)/);
    assert.match(screen, /galleryPreviewUrls\(data\.gallery, 3\)/);
    assert.match(screen, /navigation\.navigate\('ProfileGallery', \{/);
    assert.match(screen, /blockCandidateUser\(\{ myUid, candidateUid: uid \}\)/);
  });
});

describe('DiscoveryInterestsScreen (read-only)', () => {
  const screen = readShared('screens/DiscoveryInterestsScreen.tsx');

  it('resolves the passed IDs with the shared resolver and chip component', () => {
    assert.match(screen, /resolveInterestChips\(\s*readDiscoveryInterestIds\(route\.params\),\s*translateItem,?\s*\)/);
    assert.match(screen, /useInterestItemTranslator\(\)/);
    assert.match(
      screen,
      /<InterestChip\s+key=\{chip\.id\}\s+name=\{chip\.label\}\s+icon=\{chip\.icon\}\s+iconColor=\{chip\.iconColor\}\s+selected=\{false\}\s+\/>/,
    );
  });

  it('has the Interests title and a normal Back to the same profile', () => {
    assert.match(screen, /t\('discoveryProfile\.interests'\)/);
    assert.match(screen, /onPress=\{\(\) => navigation\.goBack\(\)\}/);
    assert.match(screen, /t\('discoveryProfile\.a11yBack'\)/);
  });

  it('renders nothing for an empty list and offers no editing', () => {
    assert.match(screen, /\{interestPills\.length > 0 \? \(/);
    assert.doesNotMatch(screen, /noInterests/);
    assert.doesNotMatch(screen, /<InterestChip[^>]*onPress/);
    assert.doesNotMatch(screen, /getDiscoveryProfile|firestore|setDoc|updateDoc|callable/i);
    assert.doesNotMatch(screen, /\bsave\b|\bedit\b|TextInput/i);
  });
});

describe('Navigation wiring', () => {
  const homeStack = readShared('navigation/HomeStack.tsx');

  it('registers DiscoveryInterests in HomeStack with ID-only params', () => {
    assert.match(homeStack, /import DiscoveryInterestsScreen from '\.\.\/screens\/DiscoveryInterestsScreen'/);
    assert.match(homeStack, /DiscoveryInterests: \{ interestIds: string\[\] \};/);
    assert.match(
      homeStack,
      /name="DiscoveryInterests"\s+component=\{DiscoveryInterestsScreen\}/,
    );
  });

  it('keeps existing HomeStack routes and initial route', () => {
    assert.match(homeStack, /initialRouteName="MainHome"/);
    for (const name of ['MainHome', 'NearbySearch', 'ProfileDetail', 'DiscoveryProfile', 'ProfileGallery']) {
      assert.match(homeStack, new RegExp(`name="${name}"`), name);
    }
  });

  it('is not exposed outside HomeStack (MainTabs / Profile Gate untouched)', () => {
    for (const rel of [
      'navigation/RootTabs.tsx',
      'navigation/AppNavigator.tsx',
      'navigation/ProfileStack.tsx',
      'navigation/profileGate.ts',
    ]) {
      assert.doesNotMatch(readShared(rel), /DiscoveryInterests/, rel);
    }
  });
});

describe('Discovery interests i18n EN/ES', () => {
  it('EN: Interests title and View interests action', () => {
    assert.equal(discoveryProfileEn.interests, 'Interests');
    assert.equal(discoveryProfileEn.viewInterests, 'View interests');
  });

  it('ES: Intereses title and Ver intereses action', () => {
    const es = readShared('i18n/locales/es.ts');
    const block = es.slice(es.indexOf('discoveryProfile: {'));
    assert.match(block, /\n {4}interests: 'Intereses',/);
    assert.match(block, /\n {4}viewInterests: 'Ver intereses',/);
  });
});
