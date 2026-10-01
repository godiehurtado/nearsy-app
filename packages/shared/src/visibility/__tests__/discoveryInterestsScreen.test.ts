/**
 * iOS 2.0.7 — Discovery profile interests open in a separate read-only screen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveInterestChips,
  resolveVisibleInterestIds,
} from '../interestDisplay';
import { isLegacyDisplayInterestId } from '../../interests/interestLegacyCatalog';
import enDiscovery from '../../i18n/resources/discoveryProfile';
import es from '../../i18n/locales/es';

const translateItem = (_key: string, fallback: string) => fallback;
const read = (rel: string) => readFileSync(join(__dirname, '../..', rel), 'utf8');

const profileSrc = read('screens/DiscoveryProfileScreen.tsx');
const interestsSrc = read('screens/DiscoveryInterestsScreen.tsx');
const homeStackSrc = read('navigation/HomeStack.tsx');

const CATALOG_IDS = ['technology_ai', 'travel_international'] as const;
const LEGACY_IDS = ['business_women_in_business', 'technology_app_development'] as const;

describe('Discovery interests visibility', () => {
  it('keeps the same visible IDs, order and chips as the former inline list', () => {
    const stored = [
      CATALOG_IDS[0],
      'not_in_catalog_xyz',
      LEGACY_IDS[0],
      CATALOG_IDS[1],
      LEGACY_IDS[1],
    ];
    const visible = resolveVisibleInterestIds(stored);
    assert.deepEqual(visible, [CATALOG_IDS[0], LEGACY_IDS[0], CATALOG_IDS[1], LEGACY_IDS[1]]);
    assert.deepEqual(
      resolveInterestChips(visible, translateItem),
      resolveInterestChips(stored, translateItem),
    );
  });

  it('legacy IDs keep their existing label, icon and color', () => {
    for (const id of LEGACY_IDS) assert.equal(isLegacyDisplayInterestId(id), true);
    const chips = resolveInterestChips(resolveVisibleInterestIds([...LEGACY_IDS]), translateItem);
    assert.deepEqual(
      chips.map(({ id, label, icon, iconColor }) => ({ id, label, icon, iconColor })),
      [
        {
          id: 'business_women_in_business',
          label: 'Women in Business',
          icon: 'woman-outline',
          iconColor: '#C026D3',
        },
        {
          id: 'technology_app_development',
          label: 'App Development',
          icon: 'phone-portrait-outline',
          iconColor: '#2563EB',
        },
      ],
    );
  });

  it('no stored or only unknown interests → nothing visible', () => {
    assert.deepEqual(resolveVisibleInterestIds([]), []);
    assert.deepEqual(resolveVisibleInterestIds(['not_in_catalog_xyz']), []);
  });
});

describe('DiscoveryProfile interests entry', () => {
  it('no longer renders interest chips inline', () => {
    assert.doesNotMatch(profileSrc, /InterestChip/);
    assert.doesNotMatch(profileSrc, /resolveInterestChips/);
    assert.doesNotMatch(profileSrc, /interestPills|pillsRow/);
  });

  it('shows only a navigable "View interests" entry, and only when interests are visible', () => {
    assert.match(profileSrc, /resolveVisibleInterestIds\(data\.profile\.interestIds\)/);
    assert.match(profileSrc, /\{visibleInterestIds\.length > 0 \? \(\s*<Pressable/);
    const entry = profileSrc.slice(
      profileSrc.indexOf('{/* Interests'),
      profileSrc.indexOf('{/* 6. Photos'),
    );
    assert.match(entry, /onPress=\{openInterests\}/);
    assert.match(entry, /t\('discoveryProfile\.interests'\)/);
    assert.match(entry, /t\('discoveryProfile\.viewInterests'\)/);
    assert.match(entry, /name="chevron-forward"/);
    assert.match(entry, /\) : null\}/);
  });

  it('empty profiles show no section, CTA or placeholder copy', () => {
    assert.doesNotMatch(profileSrc, /discoveryProfile\.noInterests/);
    assert.doesNotMatch(profileSrc, /always shown/);
  });

  it('keeps Bio → Affiliations → Interests entry → Photos', () => {
    const bio = profileSrc.indexOf("t('discoveryProfile.biography')");
    const affiliations = profileSrc.indexOf('<DiscoveryAffiliationsCard');
    const interests = profileSrc.indexOf("t('discoveryProfile.viewInterests')");
    const photos = profileSrc.indexOf("t('discoveryProfile.photos')");
    assert.ok(bio > 0);
    assert.ok(affiliations > bio);
    assert.ok(interests > affiliations);
    assert.ok(photos > interests);
  });

  it('navigates with visible interest IDs only — no uid, name or refetch', () => {
    assert.match(
      profileSrc,
      /navigation\.navigate\('DiscoveryInterests', \{\s*interestIds: visibleInterestIds,\s*\}\)/,
    );
    assert.match(homeStackSrc, /DiscoveryInterests: \{ interestIds: string\[\] \};/);
    assert.equal((profileSrc.match(/getDiscoveryProfile\(/g) ?? []).length, 1);
  });
});

describe('DiscoveryInterests screen', () => {
  it('is registered in HomeStack next to DiscoveryProfile', () => {
    assert.match(homeStackSrc, /import DiscoveryInterestsScreen from '\.\.\/screens\/DiscoveryInterestsScreen'/);
    const profile = homeStackSrc.indexOf('name="DiscoveryProfile"');
    const interests = homeStackSrc.indexOf('name="DiscoveryInterests"');
    assert.ok(profile > 0 && interests > profile);
    assert.match(homeStackSrc, /component=\{DiscoveryInterestsScreen\}/);
  });

  it('renders the passed IDs with the shared resolver and translation keys', () => {
    assert.match(interestsSrc, /useRoute<RouteProp<HomeStackParamList, 'DiscoveryInterests'>>/);
    assert.match(interestsSrc, /resolveInterestChips\(interestIds \?\? \[\], translateItem\)/);
    assert.match(interestsSrc, /onboarding\.profileCompletion\.interests\.items\.\$\{nameKey\}/);
    assert.match(interestsSrc, /<InterestChip[\s\S]*?selected=\{false\}/);
  });

  it('is read-only and never fetches or writes', () => {
    assert.doesNotMatch(interestsSrc, /<InterestChip[^>]*onPress/);
    assert.doesNotMatch(
      interestsSrc,
      /getVisibilityDiscoveryClient|getDiscoveryProfile|firestore|setDoc|updateDoc|firebaseAuth/,
    );
  });

  it('uses the Interests title and a normal Back', () => {
    assert.match(interestsSrc, /accessibilityRole="header"[\s\S]*?t\('discoveryProfile\.interests'\)/);
    assert.match(interestsSrc, /onPress=\{\(\) => navigation\.goBack\(\)\}/);
    assert.match(interestsSrc, /name="chevron-back"/);
  });
});

describe('Discovery interests i18n', () => {
  it('EN and ES copy', () => {
    assert.equal(enDiscovery.interests, 'Interests');
    assert.equal(enDiscovery.viewInterests, 'View interests');
    assert.equal(es.discoveryProfile.interests, 'Intereses');
    assert.equal(es.discoveryProfile.viewInterests, 'Ver intereses');
  });
});

describe('Discovery profile regression', () => {
  it('keeps affiliations, photos, profile info, context and social sections', () => {
    assert.match(profileSrc, /<DiscoveryAffiliationsCard affiliations=\{data\.affiliations\} \/>/);
    assert.match(profileSrc, /openGallery\(0\)/);
    assert.match(profileSrc, /openGallery\(index\)/);
    assert.match(profileSrc, /navigation\.navigate\('ProfileGallery'/);
    assert.match(profileSrc, /showOccupation \|\| showCompany \|\| showBio \? \(/);
    assert.match(profileSrc, /<ProfileContextCard/);
    assert.match(profileSrc, /<DiscoverySocialMediaRow links=\{publicSocialLinks\} \/>/);
    assert.match(profileSrc, /buildGetDiscoveryProfileRequest\(uid\)/);
  });

  it('Nearby still opens DiscoveryProfile by uid', () => {
    assert.match(read('screens/NearbySearchScreen.tsx'), /navigation\.navigate\('DiscoveryProfile', \{ uid: item\.uid \}\)/);
  });
});
