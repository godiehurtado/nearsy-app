/**
 * Profile Exploration pure-domain + presentation helpers tests (V1.3).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertSharedInterestsIgnoreSearchPreferences,
  buildBlockUserDoc,
  blockedUsersDocPath,
  clampGalleryIndex,
  extractViewerOnboardingInterestIds,
  galleryPreviewOverflowCount,
  galleryPreviewUrls,
  intersectOnboardingInterestIds,
  nextGalleryIndex,
  prevGalleryIndex,
  PROFILE_EXPLORATION_BLOCK_SOURCE,
  resolveSharedInterestPills,
  shouldShowBio,
  shouldShowCompany,
  shouldShowGalleryPreviewOverflow,
  shouldShowOccupation,
} from '../profileExploration';
import {
  DISCOVERY_SOCIAL_PLATFORMS,
  isAllowedDiscoverySocialHttpsUrl,
  openDiscoverySocialHttpsUrl,
  parseDiscoverySocialLinks,
} from '../discoverySocialLinks';
import {
  formatDiscoveryAffiliationTypeLabel,
  parseDiscoveryAffiliations,
} from '../discoveryAffiliations';
import {
  parseDiscoverNearbyResponse,
  parseDiscoveryProfileDetail,
  parseDiscoveryProfileSummary,
  parseGetDiscoveryProfileResponse,
  VisibilityDiscoveryClientError,
} from '../index';
import { createDefaultSearchPreferencesByMode } from '../preferences';
import { metersToFeet } from '../distance';
import { resolveDistanceDisplayUnit } from '../searchPreferencesParse';
import enDiscovery from '../../i18n/resources/discoveryProfile';
import es from '../../i18n/locales/es';

const translateItem = (_key: string, fallback: string) => fallback;

const SAMPLE_PROFILE = {
  mode: 'personal' as const,
  displayName: 'Alex R.',
  profileImage: null as string | null,
  occupation: 'Designer',
  interestIds: ['sports_outdoors_soccer'],
  ageYears: 28,
};

const SAMPLE_DETAIL = {
  ...SAMPLE_PROFILE,
  company: 'Nearsy',
  bio: 'Hello',
};

function detailPayload(extra: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    uid: 'a',
    distanceMeters: 5,
    profile: SAMPLE_DETAIL,
    gallery: [{ url: 'https://cdn.example/p.jpg' }],
    serverTime: 50,
    ...extra,
  };
}

describe('profile exploration shared interests (onboarding ∩ candidate)', () => {
  it('intersects viewer onboarding with candidate interestIds', () => {
    const viewer = extractViewerOnboardingInterestIds({
      mode: 'personal',
      personalOnboardingInterests: [
        { id: 'technology_ai' },
        { id: 'travel_international' },
        { id: 'custom_x', isCustom: true },
      ],
      professionalOnboardingInterests: [{ id: 'business_networking' }],
      searchPreferences: {
        personal: { interestIds: ['should_not_use'] },
      },
    });
    assert.deepEqual(viewer, ['technology_ai', 'travel_international']);

    const shared = intersectOnboardingInterestIds(viewer, [
      'travel_international',
      'business_networking',
      'technology_ai',
    ]);
    assert.deepEqual(shared, ['travel_international', 'technology_ai']);
  });

  it('uses professional onboarding when mode is professional', () => {
    const ids = extractViewerOnboardingInterestIds({
      mode: 'professional',
      personalOnboardingInterests: [{ id: 'travel_international' }],
      professionalOnboardingInterests: [{ id: 'business_networking' }],
    });
    assert.deepEqual(ids, ['business_networking']);
  });

  it('ignores searchPreferences for shared-interest source', () => {
    const ids = assertSharedInterestsIgnoreSearchPreferences({
      mode: 'personal',
      personalOnboardingInterests: [{ id: 'technology_ai' }],
      searchPreferences: {
        personal: { interestIds: ['business_networking', 'should_not_use'] },
      },
    });
    assert.deepEqual(ids, ['technology_ai']);
    assert.ok(!ids.includes('should_not_use'));
    assert.ok(!ids.includes('business_networking'));
  });

  it('resolves pills with localized labels never raw unresolved ids as only content', () => {
    const pills = resolveSharedInterestPills(
      ['technology_ai', 'not_in_catalog_xyz'],
      translateItem,
    );
    assert.equal(pills.length, 1);
    assert.equal(pills[0].id, 'technology_ai');
    assert.ok(pills[0].label.length > 0);
    assert.ok(!pills[0].label.includes('technology_ai'));
    assert.ok(pills[0].icon);
    assert.ok(pills[0].iconColor);
  });

  it('handles zero shared interests', () => {
    assert.deepEqual(
      intersectOnboardingInterestIds(['a'], ['b', 'c']),
      [],
    );
  });
});

describe('profile exploration field visibility', () => {
  it('shows company only for professional with non-empty company', () => {
    assert.equal(shouldShowCompany('personal', 'Acme'), false);
    assert.equal(shouldShowCompany('professional', ''), false);
    assert.equal(shouldShowCompany('professional', 'Acme'), true);
  });

  it('hides empty occupation and bio', () => {
    assert.equal(shouldShowOccupation(''), false);
    assert.equal(shouldShowOccupation('Engineer'), true);
    assert.equal(shouldShowBio('  '), false);
    assert.equal(shouldShowBio('Hello'), true);
  });

  it('formats distance ft/m', () => {
    assert.equal(resolveDistanceDisplayUnit('en-US'), 'ft');
    assert.equal(resolveDistanceDisplayUnit('es-ES'), 'm');
    assert.ok(Math.round(metersToFeet(10)) > 0);
  });

  it('previews at most 3 gallery urls with overflow math', () => {
    assert.deepEqual(galleryPreviewUrls([], 3), []);
    assert.equal(galleryPreviewUrls([{ url: 'a' }], 3).length, 1);
    assert.equal(
      galleryPreviewUrls(
        [{ url: 'a' }, { url: 'b' }, { url: 'c' }],
        3,
      ).length,
      3,
    );
    assert.equal(galleryPreviewOverflowCount(3, 3), 0);
    assert.equal(galleryPreviewOverflowCount(5, 3), 2);
    assert.equal(galleryPreviewOverflowCount(12, 3), 9);
    assert.equal(shouldShowGalleryPreviewOverflow(3, 2, 3), false);
    assert.equal(shouldShowGalleryPreviewOverflow(5, 2, 3), true);
    assert.equal(shouldShowGalleryPreviewOverflow(5, 0, 3), false);
  });

  it('clamps gallery navigation within bounds', () => {
    assert.equal(clampGalleryIndex(-1, 5), 0);
    assert.equal(clampGalleryIndex(99, 5), 4);
    assert.equal(prevGalleryIndex(0, 5), null);
    assert.equal(prevGalleryIndex(2, 5), 1);
    assert.equal(nextGalleryIndex(4, 5), null);
    assert.equal(nextGalleryIndex(0, 1), null);
    assert.equal(nextGalleryIndex(0, 5), 1);
  });
});

describe('profile exploration age privacy wire bridge (V1.4C)', () => {
  const baseSummary = {
    mode: 'personal' as const,
    displayName: 'Alex R.',
    profileImage: null,
    occupation: 'Designer',
    interestIds: ['sports_outdoors_soccer'],
  };

  it('Summary legacy with ageYears → parses and discards age', () => {
    const summary = parseDiscoveryProfileSummary({
      ...baseSummary,
      ageYears: 28,
    });
    assert.equal(summary.displayName, 'Alex R.');
    assert.equal(
      Object.prototype.hasOwnProperty.call(summary, 'ageYears'),
      false,
    );
  });

  it('Summary new without ageYears → parses', () => {
    const summary = parseDiscoveryProfileSummary(baseSummary);
    assert.equal(summary.displayName, 'Alex R.');
    assert.equal(
      Object.prototype.hasOwnProperty.call(summary, 'ageYears'),
      false,
    );
  });

  it('Detail legacy with ageYears → parses and discards age', () => {
    const detail = parseDiscoveryProfileDetail({
      ...baseSummary,
      ageYears: 31,
      company: 'Nearsy',
      bio: 'Hi',
    });
    assert.equal(detail.company, 'Nearsy');
    assert.equal(
      Object.prototype.hasOwnProperty.call(detail, 'ageYears'),
      false,
    );
  });

  it('Detail new without ageYears → parses', () => {
    const detail = parseDiscoveryProfileDetail({
      ...baseSummary,
      company: '',
      bio: '',
    });
    assert.equal(detail.bio, '');
    assert.equal(
      Object.prototype.hasOwnProperty.call(detail, 'ageYears'),
      false,
    );
  });

  it('search ageMin/ageMax preferences remain intact', () => {
    const prefs = createDefaultSearchPreferencesByMode('m', 0);
    assert.ok(typeof prefs.personal.ageMin === 'number');
    assert.ok(typeof prefs.personal.ageMax === 'number');
    assert.ok(prefs.personal.ageMin >= 18);
    assert.ok(prefs.personal.ageMax <= 99);
  });
});

describe('profile exploration affiliations wire parser (V1.4C)', () => {
  it('affiliations absent → []', () => {
    assert.deepEqual(parseDiscoveryAffiliations(undefined), []);
    const detail = parseGetDiscoveryProfileResponse(detailPayload());
    assert.deepEqual(detail.affiliations, []);
  });

  it('affiliations: [] stays empty', () => {
    assert.deepEqual(parseDiscoveryAffiliations([]), []);
  });

  it('accepts one valid affiliation', () => {
    const rows = parseDiscoveryAffiliations([
      {
        id: 'aff1',
        name: 'MIT',
        type: 'education',
        logoUrl: 'https://cdn.example/mit.png',
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'aff1');
    assert.equal(rows[0].name, 'MIT');
    assert.equal(rows[0].type, 'education');
  });

  it('preserves order across multiple affiliations', () => {
    const rows = parseDiscoveryAffiliations([
      { id: 'a', name: 'A', type: null, logoUrl: null },
      { id: 'b', name: 'B', type: 'community', logoUrl: null },
      { id: 'c', name: 'C', type: 'professional', logoUrl: null },
    ]);
    assert.deepEqual(
      rows.map((r) => r.id),
      ['a', 'b', 'c'],
    );
  });

  it('duplicate id → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoveryAffiliations([
          { id: 'dup', name: 'One', type: null, logoUrl: null },
          { id: 'dup', name: 'Two', type: null, logoUrl: null },
        ]),
      VisibilityDiscoveryClientError,
    );
  });

  it('empty name → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoveryAffiliations([
          { id: 'x', name: '  ', type: null, logoUrl: null },
        ]),
      VisibilityDiscoveryClientError,
    );
  });

  it('HTTP logoUrl → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoveryAffiliations([
          {
            id: 'x',
            name: 'Org',
            type: null,
            logoUrl: 'http://cdn.example/x.png',
          },
        ]),
      VisibilityDiscoveryClientError,
    );
  });

  it('null logoUrl accepted; type labels humanize safely', () => {
    const rows = parseDiscoveryAffiliations([
      { id: 'x', name: 'Org', type: null, logoUrl: null },
    ]);
    assert.equal(rows[0].logoUrl, null);
    assert.equal(
      formatDiscoveryAffiliationTypeLabel('education', (_k, fb) => fb),
      'Education',
    );
    assert.equal(
      formatDiscoveryAffiliationTypeLabel('custom_group', (_k, fb) => fb),
      'Custom Group',
    );
  });

  it('private extra fields → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoveryAffiliations([
          {
            id: 'x',
            name: 'Org',
            type: null,
            logoUrl: null,
            provider: 'logo_dev',
          },
        ]),
      VisibilityDiscoveryClientError,
    );
  });

  it('discoverNearby does not expect affiliations', () => {
    const discover = parseDiscoverNearbyResponse({
      contractVersion: 1,
      results: [{ uid: 'a', distanceMeters: 5, profile: SAMPLE_PROFILE }],
      nextCursor: null,
      serverTime: 50,
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(discover.results[0], 'affiliations'),
      false,
    );
  });
});

describe('profile exploration socialLinks wire parser (V1.3)', () => {
  it('socialLinks absent → []', () => {
    assert.deepEqual(parseDiscoverySocialLinks(undefined), []);
    const detail = parseGetDiscoveryProfileResponse(detailPayload());
    assert.deepEqual(detail.socialLinks, []);
  });

  it('socialLinks: [] stays empty', () => {
    assert.deepEqual(parseDiscoverySocialLinks([]), []);
    const detail = parseGetDiscoveryProfileResponse(
      detailPayload({ socialLinks: [] }),
    );
    assert.deepEqual(detail.socialLinks, []);
  });

  it('accepts one valid platform', () => {
    const links = parseDiscoverySocialLinks([
      { platform: 'instagram', url: 'https://instagram.com/nearsy' },
    ]);
    assert.equal(links.length, 1);
    assert.equal(links[0].platform, 'instagram');
    assert.equal(links[0].url, 'https://instagram.com/nearsy');
  });

  it('accepts all eight approved platforms in backend order', () => {
    const raw = DISCOVERY_SOCIAL_PLATFORMS.map((platform, i) => ({
      platform,
      url: `https://example.com/${platform}-${i}`,
    }));
    const links = parseDiscoverySocialLinks(raw);
    assert.deepEqual(
      links.map((l) => l.platform),
      [...DISCOVERY_SOCIAL_PLATFORMS],
    );
  });

  it('unknown platform → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoverySocialLinks([
          { platform: 'myspace', url: 'https://example.com/x' },
        ]),
      (err: unknown) =>
        err instanceof VisibilityDiscoveryClientError &&
        err.reason.kind === 'known' &&
        err.reason.value === 'invalid-response',
    );
  });

  it('HTTP URL → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoverySocialLinks([
          { platform: 'website', url: 'http://example.com' },
        ]),
      VisibilityDiscoveryClientError,
    );
  });

  it('valid HTTPS URL accepted', () => {
    assert.equal(
      isAllowedDiscoverySocialHttpsUrl('https://example.com/path'),
      true,
    );
    const links = parseDiscoverySocialLinks([
      { platform: 'website', url: 'https://example.com/path' },
    ]);
    assert.equal(links[0].url, 'https://example.com/path');
  });

  it('duplicate platform → invalid-response', () => {
    assert.throws(
      () =>
        parseDiscoverySocialLinks([
          { platform: 'x', url: 'https://x.com/a' },
          { platform: 'x', url: 'https://x.com/b' },
        ]),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects sensitive extra fields and non-array present values', () => {
    assert.throws(
      () =>
        parseDiscoverySocialLinks([
          {
            platform: 'linkedin',
            url: 'https://linkedin.com/in/a',
            username: 'secret',
          },
        ]),
      VisibilityDiscoveryClientError,
    );
    assert.throws(
      () => parseDiscoverySocialLinks(null),
      VisibilityDiscoveryClientError,
    );
    assert.throws(
      () => parseDiscoverySocialLinks({}),
      VisibilityDiscoveryClientError,
    );
  });

  it('rejects javascript/data/file/tel schemes', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'tel:+15551212',
    ]) {
      assert.equal(isAllowedDiscoverySocialHttpsUrl(url), false);
    }
  });

  it('discoverNearby does not require or parse socialLinks', () => {
    const discover = parseDiscoverNearbyResponse({
      contractVersion: 1,
      results: [
        { uid: 'a', distanceMeters: 5, profile: SAMPLE_PROFILE },
      ],
      nextCursor: null,
      serverTime: 50,
    });
    assert.equal(discover.results.length, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(discover.results[0], 'socialLinks'),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(discover.results[0].profile, 'socialLinks'),
      false,
    );
  });
});

describe('profile exploration social link open gate', () => {
  it('press opens only HTTPS URLs', async () => {
    const opened: string[] = [];
    const result = await openDiscoverySocialHttpsUrl(
      'https://instagram.com/ok',
      {
        canOpenURL: async () => true,
        openURL: async (url) => {
          opened.push(url);
        },
      },
    );
    assert.equal(result, 'opened');
    assert.deepEqual(opened, ['https://instagram.com/ok']);

    const rejected = await openDiscoverySocialHttpsUrl('http://evil.example', {
      canOpenURL: async () => true,
      openURL: async () => {
        throw new Error('should not open');
      },
    });
    assert.equal(rejected, 'rejected');
  });

  it('failed open surfaces failed result for localized alert', async () => {
    const failed = await openDiscoverySocialHttpsUrl('https://example.com', {
      canOpenURL: async () => false,
      openURL: async () => {},
    });
    assert.equal(failed, 'failed');

    const threw = await openDiscoverySocialHttpsUrl('https://example.com', {
      canOpenURL: async () => true,
      openURL: async () => {
        throw new Error('boom');
      },
    });
    assert.equal(threw, 'failed');
  });
});

describe('profile exploration block shape', () => {
  it('builds Rules-compatible blockedUsers payload', () => {
    const doc = buildBlockUserDoc('candidate123');
    assert.deepEqual(Object.keys(doc).sort(), [
      'blockedUid',
      'createdAt',
      'source',
    ]);
    assert.equal(doc.blockedUid, 'candidate123');
    assert.equal(doc.source, PROFILE_EXPLORATION_BLOCK_SOURCE);
    assert.equal(typeof doc.createdAt, 'number');
  });

  it('maps owner-scoped path', () => {
    const path = blockedUsersDocPath('me', 'them');
    assert.deepEqual(path.collectionPath, ['users', 'me', 'blockedUsers']);
    assert.equal(path.docId, 'them');
  });
});

describe('profile exploration i18n EN/ES', () => {
  it('keeps Compatibility and Social-related copy complete', () => {
    assert.equal(
      enDiscovery.compatibilityBody,
      'Based on your shared interests and things in common.',
    );
    assert.equal(
      es.discoveryProfile.compatibilityBody,
      'Basado en sus intereses compartidos y cosas en común.',
    );
    assert.equal(enDiscovery.compatibilityMatch, '{{score}}% Match');
    assert.equal(
      enDiscovery.compatibilityUnavailable,
      'Match score is being prepared.',
    );
    assert.equal(
      es.discoveryProfile.compatibilityUnavailable,
      'Estamos preparando la compatibilidad.',
    );
    assert.ok(enDiscovery.sharedInterests);
    assert.ok(es.discoveryProfile.sharedInterests);
    assert.ok(enDiscovery.compatibilityDemo);
    assert.ok(es.discoveryProfile.compatibilityDemo);
    assert.ok(enDiscovery.openLinkError);
    assert.ok(es.discoveryProfile.openLinkError);
    assert.ok(enDiscovery.platformLinkedin);
    assert.ok(es.discoveryProfile.platformWebsite);
    assert.ok(enDiscovery.a11ySocialMedia);
    assert.ok(enDiscovery.affiliations);
    assert.equal(es.discoveryProfile.affiliations, 'Afiliaciones');
  });
});

describe('profile exploration screen composition (static V1.4E)', () => {
  const screenPath = join(
    __dirname,
    '../../screens/DiscoveryProfileScreen.tsx',
  );
  const galleryPath = join(
    __dirname,
    '../../screens/ProfileGalleryScreen.tsx',
  );
  const nearbyPath = join(
    __dirname,
    '../../screens/NearbySearchScreen.tsx',
  );
  const nearbyIconsPath = join(
    __dirname,
    '../../components/visibility/NearbyInterestIconRow.tsx',
  );
  const compatPath = join(
    __dirname,
    '../../components/profileExploration/DiscoveryCompatibilityCard.tsx',
  );
  const socialPath = join(
    __dirname,
    '../../components/profileExploration/DiscoverySocialMediaRow.tsx',
  );
  const affiliationsPath = join(
    __dirname,
    '../../components/profileExploration/DiscoveryAffiliationsCard.tsx',
  );
  const screenSrc = readFileSync(screenPath, 'utf8');
  const gallerySrc = readFileSync(galleryPath, 'utf8');
  const nearbySrc = readFileSync(nearbyPath, 'utf8');
  const nearbyIconsSrc = readFileSync(nearbyIconsPath, 'utf8');
  const compatSrc = readFileSync(compatPath, 'utf8');
  const socialSrc = readFileSync(socialPath, 'utf8');
  const affiliationsSrc = readFileSync(affiliationsPath, 'utf8');

  it('Nearby shows interest icons without visible labels', () => {
    assert.match(nearbySrc, /NearbyInterestIconRow/);
    assert.doesNotMatch(nearbySrc, /chipLabel/);
    assert.match(nearbyIconsSrc, /accessibilityLabel=\{chip\.label\}/);
    assert.doesNotMatch(
      nearbyIconsSrc,
      /<Text[^>]*>\s*\{chip\.label\}\s*<\/Text>/,
    );
  });

  it('Nearby and Profile Exploration hide public age', () => {
    assert.doesNotMatch(nearbySrc, /ageYears/);
    assert.doesNotMatch(screenSrc, /discoveryProfile\.ageYears/);
    assert.doesNotMatch(screenSrc, /profile\.ageYears/);
    assert.doesNotMatch(gallerySrc, /ageYears/);
  });

  it('keeps identity as name, mode, distance', () => {
    assert.match(
      screenSrc,
      /accessibilityRole="header"[\s\S]{0,120}\{profile\.displayName\}/,
    );
    assert.match(screenSrc, /modeLabel/);
    assert.match(screenSrc, /distanceLabel/);
  });

  it('places shared interests in the info card, not Compatibility', () => {
    assert.match(screenSrc, /DiscoveryCompatibilityCard/);
    assert.match(screenSrc, /discoveryProfile\.sharedInterests/);
    assert.doesNotMatch(compatSrc, /InterestChip/);
    assert.doesNotMatch(compatSrc, /sharedPills|sharedIds/);
    assert.match(screenSrc, /InterestChip/);
  });

  it('wires backend compatibility score into DiscoveryCompatibilityCard', () => {
    assert.match(screenSrc, /DiscoveryCompatibilityCard/);
    assert.match(screenSrc, /compatibility=\{data\.compatibility\}/);
    assert.match(compatSrc, /compatibility\.available/);
    assert.match(compatSrc, /discoveryProfile\.compatibilityMatch/);
    assert.doesNotMatch(compatSrc, /percentGlyph/);
  });

  it('omits Social Media when empty and wires response.socialLinks', () => {
    assert.match(socialSrc, /if \(items\.length === 0\) return null/);
    assert.match(screenSrc, /data\.socialLinks/);
    assert.match(screenSrc, /DiscoverySocialMediaRow/);
  });

  it('places Social Media section before Compatibility', () => {
    const socialIdx = screenSrc.indexOf('<DiscoverySocialMediaRow');
    const compatIdx = screenSrc.indexOf('<DiscoveryCompatibilityCard');
    assert.ok(socialIdx > 0);
    assert.ok(compatIdx > socialIdx);
  });

  it('gallery preview opens View all at 0 and thumbnails at index', () => {
    assert.match(screenSrc, /openGallery\(0\)/);
    assert.match(screenSrc, /openGallery\(index\)/);
    assert.match(screenSrc, /shouldShowGalleryPreviewOverflow/);
    assert.match(screenSrc, /initialIndex/);
  });

  it('Affiliations card sits between Information and Photos; not pressable', () => {
    const infoClose = screenSrc.indexOf('{/* Affiliations');
    const affUse = screenSrc.indexOf('<DiscoveryAffiliationsCard');
    const photos = screenSrc.indexOf('{/* 6. Photos');
    assert.ok(affUse > 0);
    assert.ok(photos > affUse);
    assert.ok(infoClose > 0 && infoClose < affUse);
    assert.match(affiliationsSrc, /if \(labeled\.length === 0\) return null/);
    assert.match(affiliationsSrc, /AffiliationLogoMark/);
    assert.match(affiliationsSrc, /AFFILIATION_SELECTED_LOGO_SIZE/);
    assert.match(affiliationsSrc, /AFFILIATION_SELECTED_LOGO_RADIUS/);
    assert.doesNotMatch(affiliationsSrc, /borderRadius:\s*20|radius\.circle/);
    assert.doesNotMatch(affiliationsSrc, /onPress|Pressable|Linking/);
    assert.doesNotMatch(affiliationsSrc, /logo_dev|LogoDev|getAffiliationEntitySearch|buildLogoDev/);
    assert.match(screenSrc, /data\.affiliations/);
  });

  it('Affiliation logo mark matches CRJ selected square tokens', () => {
    const markPath = join(
      __dirname,
      '../../affiliations/AffiliationLogoMark.tsx',
    );
    const logoPath = join(__dirname, '../../affiliations/affiliationLogo.ts');
    const crjPath = join(
      __dirname,
      '../../components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    const markSrc = readFileSync(markPath, 'utf8');
    const logoSrc = readFileSync(logoPath, 'utf8');
    const crjSrc = readFileSync(crjPath, 'utf8');
    assert.match(logoSrc, /AFFILIATION_SELECTED_LOGO_SIZE = 64/);
    assert.match(logoSrc, /AFFILIATION_SELECTED_LOGO_RADIUS = 18/);
    assert.match(markSrc, /resizeMode="cover"/);
    assert.match(markSrc, /resolveAffiliationLogoPresentation/);
    assert.match(markSrc, /affiliationInitials|kind === 'initials'/);
    assert.doesNotMatch(markSrc, /borderRadius:\s*size\s*\/\s*2|radius\.circle/);
    assert.match(crjSrc, /AffiliationLogoMark/);
    assert.match(crjSrc, /AFFILIATION_SELECTED_LOGO_SIZE/);
  });

  it('Profile Gallery has counter, arrows, and active thumbnails', () => {
    assert.match(gallerySrc, /galleryCounter/);
    assert.match(gallerySrc, /a11yPreviousPhoto/);
    assert.match(gallerySrc, /a11yNextPhoto/);
    assert.match(gallerySrc, /a11ySelectPhoto/);
    assert.match(gallerySrc, /prevGalleryIndex|nextGalleryIndex/);
    assert.match(gallerySrc, /selected: active/);
    assert.match(gallerySrc, /pagingEnabled/);
  });

  it('opens links via HTTPS gate and shows localized open error', () => {
    assert.match(socialSrc, /openDiscoverySocialHttpsUrl/);
    assert.match(socialSrc, /discoveryProfile\.openLinkError/);
    assert.doesNotMatch(socialSrc, /WebView/);
  });

  it('does not peer getDoc candidate users path', () => {
    assert.doesNotMatch(screenSrc, /getDoc\(\s*doc\(\s*firestoreDb,\s*'users',\s*uid/);
    assert.doesNotMatch(gallerySrc, /getDoc\(/);
    assert.match(screenSrc, /getDiscoveryProfile/);
    assert.match(gallerySrc, /getDiscoveryProfile/);
  });

  it('wires Coming soon for Connect and Report without writing reports', () => {
    assert.match(screenSrc, /comingSoon/);
    assert.match(screenSrc, /requestToConnect/);
    assert.doesNotMatch(screenSrc, /collection\([^)]*'reports'/);
    assert.match(screenSrc, /blockCandidateUser/);
  });

  it('does not render profile.status', () => {
    assert.doesNotMatch(screenSrc, /profile\.status/);
  });

  it('uses discoveryProfile i18n namespace', () => {
    assert.match(screenSrc, /discoveryProfile\./);
    assert.match(gallerySrc, /discoveryProfile\./);
  });
});
