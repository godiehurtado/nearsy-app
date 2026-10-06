/**
 * CHG-AFF-02 — Discovery Profile affiliations inline wrap + fail-open parsing (48 cap).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISCOVERY_AFFILIATION_MAX_COLUMNS,
  DISCOVERY_AFFILIATION_MIN_TILE_WIDTH,
  MAX_DISCOVERY_AFFILIATIONS,
  parseDiscoveryAffiliations,
  resolveDiscoveryAffiliationGrid,
} from '../visibility/discoveryAffiliations.ts';
import enDiscovery from '../i18n/resources/discoveryProfile.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '..');

function readSrc(relative: string): string {
  return readFileSync(join(sharedSrc, relative), 'utf8').replace(/\r\n/g, '\n');
}

function rows(count: number, prefix = 'aff') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    name: `Org ${i}`,
    type: i % 2 === 0 ? 'schoolCollege' : null,
    logoUrl: i % 3 === 0 ? `https://cdn.example/${prefix}${i}.png` : null,
  }));
}

describe('CHG-AFF-02 parser: counts and the 48 contract cap', () => {
  it('matches the backend cap', () => {
    assert.equal(MAX_DISCOVERY_AFFILIATIONS, 48);
  });

  it('0, 1, 2, 3 (odd) and 48 affiliations parse fully in order', () => {
    for (const count of [0, 1, 2, 3, 48]) {
      const parsed = parseDiscoveryAffiliations(rows(count));
      assert.equal(parsed.length, count, `count ${count}`);
      assert.deepEqual(
        parsed.map((a) => a.id),
        rows(count).map((a) => a.id),
      );
    }
  });

  it('more than 48 keeps the first 48 without throwing', () => {
    const parsed = parseDiscoveryAffiliations(rows(75));
    assert.equal(parsed.length, 48);
    assert.equal(parsed[0].id, 'aff0');
    assert.equal(parsed[47].id, 'aff47');
  });

  it('the cap counts valid rows only (malformed rows do not consume slots)', () => {
    const parsed = parseDiscoveryAffiliations([{ id: '' }, null, ...rows(50)]);
    assert.equal(parsed.length, 48);
    assert.equal(parsed[0].id, 'aff0');
  });
});

describe('CHG-AFF-02 parser: malformed entries are dropped individually', () => {
  it('drops non-objects, missing id/name, private fields and duplicates; keeps order', () => {
    const parsed = parseDiscoveryAffiliations([
      { id: 'a', name: 'Alpha', type: null, logoUrl: null },
      'oops',
      42,
      null,
      ['nested'],
      { id: '  ', name: 'No id', type: null, logoUrl: null },
      { id: 'n', name: '', type: null, logoUrl: null },
      { id: 'p', name: 'Private', type: null, logoUrl: null, website: 'https://x.example' },
      { id: 'b', name: 'Beta', type: 'industry', logoUrl: null },
      { id: 'a', name: 'Alpha again', type: null, logoUrl: null },
      { id: 'c', name: 'Gamma', type: 'unknown_future_type', logoUrl: null },
    ]);
    assert.deepEqual(parsed.map((a) => a.id), ['a', 'b', 'c']);
    assert.equal(parsed[2].type, 'unknown_future_type');
  });

  it('never throws for non-array payloads', () => {
    for (const raw of [undefined, null, {}, 'x', 7, true]) {
      assert.doesNotThrow(() => parseDiscoveryAffiliations(raw));
      assert.deepEqual(parseDiscoveryAffiliations(raw), []);
    }
  });

  it('invalid logoUrl or type degrade to null instead of dropping the affiliation', () => {
    const parsed = parseDiscoveryAffiliations([
      { id: 'h', name: 'Http logo', type: 7, logoUrl: 'http://cdn.example/x.png' },
      { id: 'j', name: 'Script logo', type: '', logoUrl: 'javascript:alert(1)' },
      { id: 'c', name: 'Creds logo', type: null, logoUrl: 'https://u:p@cdn.example/x.png' },
      { id: 'o', name: 'Ok logo', type: ' industry ', logoUrl: ' https://cdn.example/ok.png ' },
    ]);
    assert.deepEqual(
      parsed.map((a) => [a.id, a.type, a.logoUrl]),
      [
        ['h', null, null],
        ['j', null, null],
        ['c', null, null],
        ['o', 'industry', 'https://cdn.example/ok.png'],
      ],
    );
  });

  it('keeps long names intact (UI clamps to two lines)', () => {
    const longName = 'International Association of Very Long Organization Names and Alumni';
    const parsed = parseDiscoveryAffiliations([
      { id: 'l', name: longName, type: null, logoUrl: null },
    ]);
    assert.equal(parsed[0].name, longName);
  });
});

describe('CHG-AFF-02 adaptive tile grid', () => {
  const gap = 9;

  it('returns null until measured', () => {
    assert.equal(resolveDiscoveryAffiliationGrid(0, gap), null);
    assert.equal(resolveDiscoveryAffiliationGrid(Number.NaN, gap), null);
  });

  it('about two tiles per row on phones, one on very narrow, max three on wide', () => {
    assert.equal(resolveDiscoveryAffiliationGrid(200, gap)?.columns, 1);
    assert.equal(resolveDiscoveryAffiliationGrid(256, gap)?.columns, 2);
    assert.equal(resolveDiscoveryAffiliationGrid(296, gap)?.columns, 2);
    assert.equal(resolveDiscoveryAffiliationGrid(348, gap)?.columns, 2);
    assert.equal(resolveDiscoveryAffiliationGrid(700, gap)?.columns, DISCOVERY_AFFILIATION_MAX_COLUMNS);
  });

  it('tiles always fit the row and respect the minimum width when multi-column', () => {
    for (let width = 120; width <= 1200; width += 7) {
      const grid = resolveDiscoveryAffiliationGrid(width, gap)!;
      assert.ok(grid.columns * grid.tileWidth + gap * (grid.columns - 1) <= width, `w=${width}`);
      if (grid.columns > 1) {
        assert.ok(grid.tileWidth >= DISCOVERY_AFFILIATION_MIN_TILE_WIDTH, `w=${width}`);
      }
    }
  });
});

describe('CHG-AFF-02 DiscoveryAffiliationsCard layout (static)', () => {
  const card = readSrc('components/profileExploration/DiscoveryAffiliationsCard.tsx');
  const logo = readSrc('affiliations/affiliationLogo.ts');
  const mark = readSrc('affiliations/AffiliationLogoMark.tsx');

  it('has no horizontal carousel', () => {
    assert.doesNotMatch(card, /ScrollView|horizontal|showsHorizontalScrollIndicator|FlatList/);
  });

  it('renders every affiliation in a wrapping row grid sized from the container', () => {
    assert.match(card, /flexDirection: 'row'/);
    assert.match(card, /flexWrap: 'wrap'/);
    assert.match(card, /onLayout=\{onGridLayout\}/);
    assert.match(card, /resolveDiscoveryAffiliationGrid\(gridWidth, TILE_GAP\)/);
    assert.match(card, /labeled\.map\(/);
    assert.match(card, /\.slice\(0, MAX_DISCOVERY_AFFILIATIONS\)/);
    assert.doesNotMatch(card, /width: 220/);
  });

  it('compact tile keeps a recognizable 44pt logo and two-line names', () => {
    assert.match(logo, /AFFILIATION_DISCOVERY_LOGO_SIZE = 44/);
    assert.match(logo, /AFFILIATION_DISCOVERY_LOGO_RADIUS = 12/);
    assert.match(card, /size=\{AFFILIATION_DISCOVERY_LOGO_SIZE\}/);
    assert.match(card, /borderRadius=\{AFFILIATION_DISCOVERY_LOGO_RADIUS\}/);
    assert.match(card, /styles\.name[\s\S]{0,80}numberOfLines=\{2\}/);
  });

  it('logo load failure uses the existing logo mark fallback', () => {
    assert.match(card, /<AffiliationLogoMark/);
    assert.match(mark, /onError=\{\(\) => setRemoteFailed\(true\)\}/);
    assert.match(mark, /kind === 'initials'/);
  });

  it('onboarding logo tokens are unchanged', () => {
    assert.match(logo, /AFFILIATION_SELECTED_LOGO_SIZE = 64/);
    assert.match(logo, /AFFILIATION_SELECTED_LOGO_RADIUS = 18/);
    assert.match(logo, /AFFILIATION_RESULT_LOGO_SIZE = 40/);
    const crj = readSrc('components/registration/OnboardingAffiliationCategoryPanel.tsx');
    assert.match(crj, /AFFILIATION_SELECTED_LOGO_SIZE/);
    assert.doesNotMatch(crj, /AFFILIATION_DISCOVERY_LOGO/);
  });

  it('light/dark: colors come from the theme palette only', () => {
    assert.match(card, /useAppTheme\(\)/);
    assert.match(card, /palette\.(panel|surface|border|textPrimary|textSecondary|textMuted)/);
    assert.doesNotMatch(card, /#[0-9A-Fa-f]{3,8}\b/);
  });

  it('stays non-interactive', () => {
    assert.doesNotMatch(card, /onPress|Pressable|Linking/);
  });
});

describe('CHG-AFF-02 i18n EN/ES', () => {
  it('keeps the Affiliations title and category label translation path', () => {
    assert.equal(enDiscovery.affiliations, 'Affiliations');
    assert.match(readSrc('i18n/locales/es.ts'), /affiliations: 'Afiliaciones'/);
    const card = readSrc('components/profileExploration/DiscoveryAffiliationsCard.tsx');
    assert.match(card, /t\('discoveryProfile\.affiliations'\)/);
    assert.match(card, /onboarding\.profileCompletion\.affiliations\.categories\.\$\{nameKey\}/);
  });
});

describe('CHG-AFF-02 Discovery Profile composition (no regressions)', () => {
  const screen = readSrc('screens/DiscoveryProfileScreen.tsx');

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

  it('interests entry and gallery wiring are untouched', () => {
    assert.match(screen, /<DiscoveryAffiliationsCard affiliations=\{data\.affiliations\} \/>/);
    assert.match(screen, /navigation\.navigate\('DiscoveryInterests', interestsParams\)/);
    assert.match(screen, /galleryPreviewUrls\(data\.gallery, 3\)/);
    assert.match(screen, /openGallery\(0\)/);
  });
});
