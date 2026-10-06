/**
 * CHG-AFF-02 — Discovery affiliations inline wrap + fail-open parsing (cap 48).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAX_DISCOVERY_AFFILIATIONS,
  parseDiscoveryAffiliations,
} from '../discoveryAffiliations';
import { parseGetDiscoveryProfileResponse } from '../index';
import {
  DISCOVERY_AFFILIATION_MAX_COLUMNS,
  resolveDiscoveryAffiliationColumns,
  resolveDiscoveryAffiliationTileWidth,
} from '../../components/profileExploration/discoveryAffiliationsLayout';
import { resolveAffiliationLogoPresentation } from '../../affiliations/affiliationLogo';
import enDiscovery from '../../i18n/resources/discoveryProfile';
import es from '../../i18n/locales/es';

function rows(count: number, prefix = 'aff') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    name: `Org ${i}`,
    type: i % 2 === 0 ? 'education' : null,
    logoUrl: i % 3 === 0 ? `https://cdn.example/${i}.png` : null,
  }));
}

function detailPayload(affiliations: unknown) {
  return {
    contractVersion: 1,
    uid: 'a',
    distanceMeters: 5,
    profile: {
      mode: 'personal',
      displayName: 'Alex R.',
      profileImage: null,
      occupation: 'Designer',
      interestIds: ['sports_outdoors_soccer'],
      ageYears: 28,
      company: 'Nearsy',
      bio: 'Hello',
    },
    gallery: [{ url: 'https://cdn.example/p.jpg' }],
    serverTime: 50,
    affiliations,
  };
}

const cardSrc = readFileSync(
  join(__dirname, '../../components/profileExploration/DiscoveryAffiliationsCard.tsx'),
  'utf8',
);
const screenSrc = readFileSync(
  join(__dirname, '../../screens/DiscoveryProfileScreen.tsx'),
  'utf8',
);
const crjPanelSrc = readFileSync(
  join(__dirname, '../../components/registration/OnboardingAffiliationCategoryPanel.tsx'),
  'utf8',
);

describe('CHG-AFF-02 parsing — counts and cap', () => {
  it('cap mirrors the backend contract (48)', () => {
    assert.equal(MAX_DISCOVERY_AFFILIATIONS, 48);
  });

  for (const count of [0, 1, 2, 3, 48]) {
    it(`keeps all ${count} valid affiliations in order`, () => {
      const parsed = parseDiscoveryAffiliations(rows(count));
      assert.equal(parsed.length, count);
      assert.deepEqual(
        parsed.map((r) => r.id),
        rows(count).map((r) => r.id),
      );
    });
  }

  it('more than 48 → processes the first 48 safely without failing', () => {
    const parsed = parseDiscoveryAffiliations(rows(60));
    assert.equal(parsed.length, 48);
    assert.equal(parsed[0].id, 'aff0');
    assert.equal(parsed[47].id, 'aff47');
  });

  it('a profile with 25–48 affiliations loads (previous client cap was 24)', () => {
    const detail = parseGetDiscoveryProfileResponse(detailPayload(rows(30)));
    assert.equal(detail.affiliations.length, 30);
    assert.equal(detail.profile.displayName, 'Alex R.');
  });

  it('absent or non-array affiliations → [] without failing the profile', () => {
    assert.deepEqual(parseDiscoveryAffiliations(undefined), []);
    assert.deepEqual(parseDiscoveryAffiliations(null), []);
    assert.deepEqual(parseDiscoveryAffiliations({ id: 'a' }), []);
    const detail = parseGetDiscoveryProfileResponse(detailPayload('broken'));
    assert.deepEqual(detail.affiliations, []);
    assert.equal(detail.gallery.length, 1);
  });
});

describe('CHG-AFF-02 parsing — malformed rows are hidden individually', () => {
  it('drops malformed / unknown rows and keeps the valid ones in order', () => {
    const parsed = parseDiscoveryAffiliations([
      { id: 'a', name: 'Alpha', type: 'education', logoUrl: null },
      null,
      'string-row',
      ['array-row'],
      { id: '', name: 'No id', type: null, logoUrl: null },
      { id: 'b', name: 42, type: null, logoUrl: null },
      { id: 'c', name: 'Secret', type: null, logoUrl: null, website: 'https://x.example' },
      { id: 'd', name: 'Delta', type: 7, logoUrl: 'javascript:alert(1)' },
      { id: 'a', name: 'Alpha again', type: null, logoUrl: null },
      { id: 'e', name: '  Echo  ', type: '  community ', logoUrl: ' https://cdn.example/e.png ' },
    ]);
    assert.deepEqual(parsed, [
      { id: 'a', name: 'Alpha', type: 'education', logoUrl: null },
      { id: 'd', name: 'Delta', type: null, logoUrl: null },
      { id: 'e', name: 'Echo', type: 'community', logoUrl: 'https://cdn.example/e.png' },
    ]);
  });

  it('a malformed affiliation never fails getDiscoveryProfile', () => {
    const detail = parseGetDiscoveryProfileResponse(
      detailPayload([{ id: 'ok', name: 'Fine', type: null, logoUrl: null }, { bad: true }]),
    );
    assert.deepEqual(detail.affiliations.map((a) => a.id), ['ok']);
  });

  it('long names are kept intact (UI clamps to two lines)', () => {
    const longName = 'International Association of Very Long Organization Names and Friends';
    const parsed = parseDiscoveryAffiliations([
      { id: 'l', name: longName, type: null, logoUrl: null },
    ]);
    assert.equal(parsed[0].name, longName);
    assert.match(cardSrc, /numberOfLines=\{2\}/);
  });

  it('missing or failed logo falls back to the initials mark', () => {
    assert.equal(
      resolveAffiliationLogoPresentation({ name: 'Open Source Club', logoUrl: null }).kind,
      'initials',
    );
    assert.equal(
      resolveAffiliationLogoPresentation({ name: 'Open Source Club', logoUrl: 'https://cdn.example/l.png' }).kind,
      'remote',
    );
    const markSrc = readFileSync(join(__dirname, '../../affiliations/AffiliationLogoMark.tsx'), 'utf8');
    assert.match(markSrc, /onError=\{\(\) => setRemoteFailed\(true\)\}/);
  });
});

describe('CHG-AFF-02 layout — adaptive wrap grid', () => {
  const gap = 9;

  it('two columns on phone widths', () => {
    for (const width of [260, 301, 318, 350]) {
      assert.equal(resolveDiscoveryAffiliationColumns(width, gap), 2, String(width));
    }
  });

  it('one column on very narrow widths, at most three on wide screens', () => {
    assert.equal(resolveDiscoveryAffiliationColumns(200, gap), 1);
    assert.equal(resolveDiscoveryAffiliationColumns(700, gap), DISCOVERY_AFFILIATION_MAX_COLUMNS);
    assert.equal(resolveDiscoveryAffiliationColumns(1200, gap), 3);
  });

  it('tile width fills the row exactly and is null before measurement', () => {
    assert.equal(resolveDiscoveryAffiliationTileWidth(0, gap), null);
    assert.equal(resolveDiscoveryAffiliationTileWidth(Number.NaN, gap), null);
    const width = 318;
    const tile = resolveDiscoveryAffiliationTileWidth(width, gap)!;
    assert.ok(tile * 2 + gap <= width);
    assert.ok(tile * 2 + gap >= width - 1);
  });
});

describe('CHG-AFF-02 static — card, screen order, theme, i18n', () => {
  it('removes the horizontal carousel and renders an inline wrap grid', () => {
    assert.doesNotMatch(cardSrc, /ScrollView/);
    assert.doesNotMatch(cardSrc, /^\s*horizontal\b|horizontal=\{/m);
    assert.doesNotMatch(cardSrc, /FlatList|showsHorizontalScrollIndicator/);
    assert.match(cardSrc, /flexWrap: 'wrap'/);
    assert.match(cardSrc, /onLayout=\{onGridLayout\}/);
    assert.match(cardSrc, /resolveDiscoveryAffiliationTileWidth/);
    assert.doesNotMatch(cardSrc, /width: 220/);
  });

  it('renders every parsed affiliation (no slicing in the card) and stays non-pressable', () => {
    assert.match(cardSrc, /labeled\.map\(/);
    assert.doesNotMatch(cardSrc, /\.slice\(/);
    assert.doesNotMatch(cardSrc, /onPress|Pressable|Linking/);
    assert.match(cardSrc, /if \(labeled\.length === 0\) return null/);
  });

  it('uses the compact Discovery logo size; onboarding keeps its own size', () => {
    assert.match(cardSrc, /size=\{AFFILIATION_DISCOVERY_LOGO_SIZE\}/);
    assert.match(crjPanelSrc, /AFFILIATION_SELECTED_LOGO_SIZE/);
    assert.doesNotMatch(crjPanelSrc, /AFFILIATION_DISCOVERY_LOGO/);
  });

  it('colors come from the theme palette (light/dark)', () => {
    assert.match(cardSrc, /useAppTheme\(\)/);
    for (const token of ['palette.panel', 'palette.surface', 'palette.border', 'palette.textPrimary', 'palette.textSecondary', 'palette.textMuted']) {
      assert.ok(cardSrc.includes(token), token);
    }
    assert.doesNotMatch(cardSrc, /color:\s*'#/);
  });

  it('keeps section order Bio → Affiliations → Interests → Photos', () => {
    const bio = screenSrc.indexOf("t('discoveryProfile.biography')");
    const aff = screenSrc.indexOf('<DiscoveryAffiliationsCard affiliations={data.affiliations} />');
    const interests = screenSrc.indexOf("t('discoveryProfile.interests')");
    const photos = screenSrc.indexOf('{/* 6. Photos');
    assert.ok(bio > 0 && aff > bio && interests > aff && photos > interests);
  });

  it('title and category labels stay localized EN/ES', () => {
    assert.equal(enDiscovery.affiliations, 'Affiliations');
    assert.equal(es.discoveryProfile.affiliations, 'Afiliaciones');
    assert.match(cardSrc, /t\('discoveryProfile\.affiliations'\)/);
    assert.match(cardSrc, /onboarding\.profileCompletion\.affiliations\.categories\./);
  });
});
