/**
 * Alignment wire parsing + UI contract tests (Matching I2 / I3).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import enAlignment from '../../i18n/resources/alignment';
import enDiscovery from '../../i18n/resources/discoveryProfile';
import es from '../../i18n/locales/es';
import {
  ALIGNMENT_TIERS,
  DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS,
  FORBIDDEN_DISCOVERY_COMPATIBILITY_KEYS,
  parseDiscoveryCompatibility,
  toAlignment,
} from '../discoveryCompatibility';
import {
  alignmentAccessibilityLabel,
  alignmentTierLabel,
  shouldShowNearbyTierBadge,
} from '../alignmentPresentation';
import { computeAlignmentRingGeometry } from '../../components/alignment/alignmentRingGeometry';
import {
  parseDiscoverNearbyResponse,
  parseGetDiscoveryProfileResponse,
  VisibilityDiscoveryClientError,
} from '../callables';

const ROOT = join(__dirname, '..', '..');
const SAMPLE_PROFILE = {
  mode: 'personal' as const,
  displayName: 'Alex R.',
  profileImage: null as string | null,
  occupation: 'Designer',
  interestIds: ['sports_outdoors_soccer'],
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

function nearbyPayload(results: unknown[]) {
  return {
    contractVersion: 1,
    results,
    nextCursor: null,
    serverTime: 50,
  };
}

function nearbyResult(uid: string, compatibility?: Record<string, unknown>) {
  return {
    uid,
    distanceMeters: 12,
    profile: SAMPLE_PROFILE,
    ...(compatibility !== undefined ? { compatibility } : {}),
  };
}

const tEn = ((key: string, opts?: Record<string, unknown>) => {
  const parts = key.split('.');
  let cur: any = { alignment: enAlignment };
  for (const part of parts) {
    cur = cur?.[part];
  }
  if (typeof cur !== 'string') return key;
  return cur.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? ''));
}) as any;

const tEs = ((key: string, opts?: Record<string, unknown>) => {
  const parts = key.split('.');
  let cur: any = es;
  for (const part of parts) {
    cur = cur?.[part];
  }
  if (typeof cur !== 'string') return key;
  return cur.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? ''));
}) as any;

describe('parseDiscoveryCompatibility — Alignment M4A', () => {
  for (const [tier, score] of [
    ['weak', 15],
    ['partial', 50],
    ['strong', 66],
    ['full', 97],
  ] as const) {
    it(`parses available ${tier}`, () => {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score,
        alignmentTier: tier,
        alignmentVersion: '1',
        formulaVersion: '1',
      });
      assert.equal(parsed?.available, true);
      if (parsed?.available) {
        assert.equal(parsed.score, score);
        assert.equal(parsed.alignmentTier, tier);
        assert.equal(parsed.alignmentVersion, '1');
      }
    });
  }

  it('parses score 0 and 100', () => {
    for (const score of [0, 100]) {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score,
        alignmentTier: score === 0 ? 'weak' : 'full',
        alignmentVersion: '1',
        formulaVersion: '1',
      });
      assert.equal(parsed?.available, true);
      if (parsed?.available) assert.equal(parsed.score, score);
    }
  });

  it('legacy available with score only — no invented tier', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 66,
      formulaVersion: '1',
    });
    assert.deepEqual(parsed, {
      available: true,
      score: 66,
      formulaVersion: '1',
    });
    const alignment = toAlignment(parsed);
    assert.equal(alignment?.available, true);
    if (alignment?.available) {
      assert.equal(alignment.score, 66);
      assert.equal(alignment.tier, undefined);
    }
  });

  it('rejects decimal score', () => {
    assert.equal(
      parseDiscoveryCompatibility({
        available: true,
        score: 66.5,
        formulaVersion: '1',
      })?.available,
      false,
    );
  });

  it('invalid tier preserves score without category', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 66,
      alignmentTier: 'excellent',
      alignmentVersion: '1',
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, true);
    if (parsed?.available) {
      assert.equal(parsed.score, 66);
      assert.equal(parsed.alignmentTier, undefined);
    }
  });

  it('invalid alignmentVersion omits tier', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 80,
      alignmentTier: 'strong',
      alignmentVersion: '2',
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, true);
    if (parsed?.available) {
      assert.equal(parsed.score, 80);
      assert.equal(parsed.alignmentTier, undefined);
    }
  });

  it('invalid formulaVersion degrades to unavailable', () => {
    assert.equal(
      parseDiscoveryCompatibility({
        available: true,
        score: 50,
        formulaVersion: '2',
      })?.available,
      false,
    );
  });

  it('unavailable with known reason', () => {
    const parsed = parseDiscoveryCompatibility({
      available: false,
      reason: 'embeddings-pending',
      alignmentVersion: '1',
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, false);
  });

  it('unknown reason degrades safely', () => {
    const parsed = parseDiscoveryCompatibility({
      available: false,
      reason: 'unknown-code',
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, false);
    if (parsed && !parsed.available) {
      assert.equal(parsed.reason, undefined);
    }
  });

  it('returns undefined when field absent', () => {
    assert.equal(parseDiscoveryCompatibility(undefined), undefined);
  });

  it('does not propagate forbidden internal keys', () => {
    for (const key of ['vector', 'cosine', 'cacheKey']) {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score: 50,
        formulaVersion: '1',
        [key]: 'x',
      });
      assert.equal(parsed?.available, false);
      assert.doesNotMatch(JSON.stringify(parsed), new RegExp(key, 'i'));
    }
  });
});

describe('discoverNearby compatibility integration', () => {
  it('parses per-result compatibility without failing list', () => {
    const response = parseDiscoverNearbyResponse(
      nearbyPayload([
        nearbyResult('c1', {
          available: true,
          score: 66,
          alignmentTier: 'strong',
          alignmentVersion: '1',
          formulaVersion: '1',
        }),
        nearbyResult('c2', {
          available: true,
          score: 12.5,
          formulaVersion: '1',
        }),
      ]),
    );
    assert.equal(response.results.length, 2);
    assert.equal(response.results[0].compatibility?.available, true);
    assert.equal(response.results[1].compatibility?.available, false);
  });

  it('Profile still parses when compatibility invalid', () => {
    const detail = parseGetDiscoveryProfileResponse(
      detailPayload({
        compatibility: { available: true, score: NaN, formulaVersion: '1' },
      }),
    );
    assert.equal(detail.profile.displayName, 'Alex R.');
    assert.equal(detail.compatibility?.available, false);
  });
});

describe('Alignment presentation helpers', () => {
  it('shows Nearby badge only for strong and full', () => {
    assert.equal(shouldShowNearbyTierBadge('strong'), true);
    assert.equal(shouldShowNearbyTierBadge('full'), true);
    assert.equal(shouldShowNearbyTierBadge('weak'), false);
    assert.equal(shouldShowNearbyTierBadge('partial'), false);
    assert.equal(shouldShowNearbyTierBadge(undefined), false);
  });

  it('a11y EN/ES includes tier when present', () => {
    const enLabel = alignmentAccessibilityLabel(tEn, {
      available: true,
      score: 66,
      tier: 'strong',
    });
    assert.match(enLabel, /66/);
    assert.match(enLabel, /Closely aligned/i);

    const esLabel = alignmentAccessibilityLabel(tEs, {
      available: true,
      score: 66,
      tier: 'strong',
    });
    assert.match(esLabel, /66/);
    assert.match(esLabel, /Muy alineados/i);
  });
});

describe('Alignment i18n EN/ES', () => {
  it('exposes four tier labels without banned terminology', () => {
    for (const tier of ALIGNMENT_TIERS) {
      assert.ok(enAlignment.tiers[tier]);
      assert.ok(es.alignment.tiers[tier]);
    }
    assert.equal(enAlignment.title, 'Alignment');
    assert.equal(es.alignment.title, 'Alineación');
    assert.equal(enAlignment.unavailable, 'Alignment is being prepared.');
    assert.equal(es.alignment.unavailable, 'Estamos preparando la alineación.');
    assert.equal(es.alignment.tiers.full, 'Alineación excepcional');
    const bundle = JSON.stringify({ en: enAlignment, es: es.alignment });
    for (const banned of [
      'Compatibility',
      'Match score',
      'Weak alignment',
      'Alineación rara',
      ...DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS,
    ]) {
      assert.doesNotMatch(bundle, new RegExp(banned, 'i'));
    }
  });
});

describe('Alignment UI contract (static)', () => {
  const nearbyPath = join(ROOT, 'screens/NearbySearchScreen.tsx');
  const compatPath = join(
    ROOT,
    'components/profileExploration/DiscoveryCompatibilityCard.tsx',
  );
  const ringPath = join(ROOT, 'components/alignment/AlignmentScoreRing.tsx');
  const nearbySrc = readFileSync(nearbyPath, 'utf8');
  const compatSrc = readFileSync(compatPath, 'utf8');
  const ringSrc = readFileSync(ringPath, 'utf8');

  it('Nearby uses compact ring from discoverNearby score only', () => {
    assert.match(nearbySrc, /AlignmentScoreRing/);
    assert.match(nearbySrc, /variant="compact"/);
    assert.match(nearbySrc, /toAlignment\(item\.compatibility\)/);
    assert.match(nearbySrc, /shouldShowNearbyTierBadge/);
    assert.doesNotMatch(nearbySrc, /getDiscoveryProfile/);
  });

  it('Nearby hides ring for unavailable and legacy without score', () => {
    assert.match(nearbySrc, /alignment\?\.available === true/);
    assert.doesNotMatch(nearbySrc, /preparing/i);
  });

  it('Profile card uses Alignment copy and detail ring', () => {
    assert.match(compatSrc, /alignmentTitleLabel/);
    assert.match(compatSrc, /alignmentUnavailableLabel/);
    assert.match(compatSrc, /AlignmentScoreRing/);
    assert.match(compatSrc, /variant="detail"/);
    assert.doesNotMatch(compatSrc, /compatibilityMatch/);
    assert.doesNotMatch(compatSrc, /discoveryProfile\.compatibility/);
  });

  it('shared ring avoids traffic-light semantics', () => {
    assert.match(ringSrc, /palette\.primary/);
    assert.doesNotMatch(ringSrc, /palette\.(success|error|warning)/);
    assert.doesNotMatch(ringSrc, /#FF0000|heart|Ionicons.*star/i);
  });

  it('user-facing sources avoid Compatibility/Match strings', () => {
    for (const src of [nearbySrc, compatSrc, ringSrc]) {
      assert.doesNotMatch(src, /discoveryProfile\.compatibility/);
      assert.doesNotMatch(src, /compatibilityMatch/);
      assert.doesNotMatch(src, /Match score/);
      assert.doesNotMatch(src, /embeddings-/);
    }
    for (const reason of DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS) {
      assert.doesNotMatch(nearbySrc, new RegExp(reason));
      assert.doesNotMatch(compatSrc, new RegExp(reason));
    }
  });

  it('Nearby card keeps one Pressable per list item', () => {
    const renderStart = nearbySrc.indexOf('const renderCard');
    const renderEnd = nearbySrc.indexOf('\n  };', renderStart);
    const renderCard = nearbySrc.slice(renderStart, renderEnd);
    assert.match(renderCard, /accessibilityLabel=\{cardA11y\}/);
    assert.match(renderCard, /navigation\.navigate\('DiscoveryProfile'/);
    assert.equal((renderCard.match(/<Pressable/g) ?? []).length, 1);
  });
});

describe('Alignment ring geometry (I3.2)', () => {
  it('1. score 0 → first 0°, second 0°', () => {
    const g = computeAlignmentRingGeometry(0);
    assert.equal(g.firstHalfDegrees, 0);
    assert.equal(g.secondHalfDegrees, 0);
    assert.equal(g.totalDegrees, 0);
    assert.equal(g.isEmpty, true);
    assert.equal(g.isFull, false);
  });

  it('2. score 25 → 90°, 0°', () => {
    const g = computeAlignmentRingGeometry(25);
    assert.equal(g.firstHalfDegrees, 90);
    assert.equal(g.secondHalfDegrees, 0);
    assert.equal(g.totalDegrees, 90);
  });

  it('3. score 50 → 180°, 0°', () => {
    const g = computeAlignmentRingGeometry(50);
    assert.equal(g.firstHalfDegrees, 180);
    assert.equal(g.secondHalfDegrees, 0);
    assert.equal(g.totalDegrees, 180);
  });

  it('4. score 66 → 180°, 57.6°', () => {
    const g = computeAlignmentRingGeometry(66);
    assert.equal(g.totalDegrees, 237.6);
    assert.equal(g.firstHalfDegrees, 180);
    assert.equal(g.secondHalfDegrees, 57.6);
    assert.equal(g.trackRemainingDegrees, 122.4);
    assert.equal(g.isFull, false);
  });

  it('5. score 75 → 180°, 90°', () => {
    const g = computeAlignmentRingGeometry(75);
    assert.equal(g.firstHalfDegrees, 180);
    assert.equal(g.secondHalfDegrees, 90);
    assert.equal(g.totalDegrees, 270);
  });

  it('6. score 100 → 180°, 180°', () => {
    const g = computeAlignmentRingGeometry(100);
    assert.equal(g.firstHalfDegrees, 180);
    assert.equal(g.secondHalfDegrees, 180);
    assert.equal(g.totalDegrees, 360);
    assert.equal(g.isFull, true);
    assert.equal(g.trackRemainingDegrees, 0);
  });

  it('7. monotonicity 0–100', () => {
    let prev = -1;
    for (let s = 0; s <= 100; s += 1) {
      const d = computeAlignmentRingGeometry(s).totalDegrees;
      assert.ok(d >= prev, `score ${s} degrees ${d} < prev ${prev}`);
      prev = d;
    }
  });

  it('8. never exceeds 360°', () => {
    for (const s of [-5, 0, 66, 100, 150, Number.NaN]) {
      assert.ok(computeAlignmentRingGeometry(s).totalDegrees <= 360);
    }
  });

  it('9. track remaining visible for any score < 100', () => {
    for (let s = 0; s < 100; s += 1) {
      const g = computeAlignmentRingGeometry(s);
      assert.ok(g.trackRemainingDegrees > 0);
      assert.equal(g.isFull, false);
    }
  });

  it('10. full progress only for 100', () => {
    assert.equal(computeAlignmentRingGeometry(99).isFull, false);
    assert.equal(computeAlignmentRingGeometry(100).isFull, true);
    assert.equal(computeAlignmentRingGeometry(66).isFull, false);
  });
});

describe('Alignment visual layout contract (I3.1 / I3.2)', () => {
  const nearbyPath = join(ROOT, 'screens/NearbySearchScreen.tsx');
  const compatPath = join(
    ROOT,
    'components/profileExploration/DiscoveryCompatibilityCard.tsx',
  );
  const ringPath = join(ROOT, 'components/alignment/AlignmentScoreRing.tsx');
  const geomPath = join(ROOT, 'components/alignment/alignmentRingGeometry.ts');
  const nearbyIconsPath = join(
    ROOT,
    'components/visibility/NearbyInterestIconRow.tsx',
  );
  const nearbySrc = readFileSync(nearbyPath, 'utf8');
  const compatSrc = readFileSync(compatPath, 'utf8');
  const ringSrc = readFileSync(ringPath, 'utf8');
  const geomSrc = readFileSync(geomPath, 'utf8');
  const nearbyIconsSrc = readFileSync(nearbyIconsPath, 'utf8');

  it('detail ring stays square 76 with stroke 7', () => {
    assert.match(ringSrc, /ALIGNMENT_RING_DETAIL_SIZE\s*=\s*76/);
    assert.match(ringSrc, /ALIGNMENT_RING_DETAIL_STROKE\s*=\s*7/);
    assert.match(ringSrc, /flexShrink:\s*0/);
  });

  it('11. score 66 does not activate visual full state', () => {
    assert.equal(computeAlignmentRingGeometry(66).isFull, false);
    assert.match(ringSrc, /isFull \? \{ testID: 'alignment-ring-progress-full'/);
    assert.match(ringSrc, /computeAlignmentRingGeometry/);
  });

  it('12. score 100 activates full progress state', () => {
    assert.equal(computeAlignmentRingGeometry(100).isFull, true);
    assert.match(ringSrc, /alignment-ring-progress-full/);
  });

  it('13. compact size is 48', () => {
    assert.match(ringSrc, /ALIGNMENT_RING_COMPACT_SIZE\s*=\s*48/);
  });

  it('14. compact stroke is 4', () => {
    assert.match(ringSrc, /ALIGNMENT_RING_COMPACT_STROKE\s*=\s*4/);
  });

  it('15. compact 100% allows font size fit', () => {
    assert.match(ringSrc, /adjustsFontSizeToFit/);
    assert.match(ringSrc, /minimumFontScale=\{0\.65\}/);
    assert.match(ringSrc, /isCompact \? 14 : 16/);
    assert.match(ringSrc, /percentCompact/);
    assert.match(ringSrc, /fontWeight\.semibold/);
  });

  it('16. detail keeps 76/7', () => {
    assert.match(ringSrc, /ALIGNMENT_RING_DETAIL_SIZE\s*=\s*76/);
    assert.match(ringSrc, /ALIGNMENT_RING_DETAIL_STROKE\s*=\s*7/);
    assert.match(compatSrc, /ALIGNMENT_RING_DETAIL_SIZE/);
  });

  it('17. progress starts at top (-90deg)', () => {
    assert.match(ringSrc, /rotate:\s*'-90deg'/);
  });

  it('18. clockwise via positive half-clip rotation from geometry', () => {
    assert.match(ringSrc, /firstHalfDegrees - 180/);
    assert.match(ringSrc, /secondHalfDegrees - 180/);
    assert.match(geomSrc, /clamped \* 360\)\s*\/\s*100|score \* 3\.6/);
    assert.match(ringSrc, /clockwise/i);
  });

  it('19. Nearby still has no absolute Alignment positioning', () => {
    assert.doesNotMatch(nearbySrc, /alignmentCorner/);
    const alignStyleStart = nearbySrc.indexOf('alignmentColumn:');
    assert.ok(alignStyleStart > 0);
    const alignStyleBlock = nearbySrc.slice(
      alignStyleStart,
      alignStyleStart + 180,
    );
    assert.doesNotMatch(alignStyleBlock, /position:\s*['"]absolute['"]/);
    assert.match(nearbySrc, /width:\s*78/);
  });

  it('20. badge and chips remain separated', () => {
    assert.match(nearbySrc, /styles\.alignmentColumn/);
    assert.match(nearbySrc, /styles\.cardTopRow/);
    const renderStart = nearbySrc.indexOf('const renderCard');
    const renderEnd = nearbySrc.indexOf('\n  };', renderStart);
    const renderCard = nearbySrc.slice(renderStart, renderEnd);
    assert.ok(
      renderCard.indexOf('<NearbyInterestIconRow') >
        renderCard.indexOf('styles.cardTopRow'),
    );
    assert.match(nearbyIconsSrc, /layout\.overflowCount/);
  });

  it('21. accessibility keeps score and tier', () => {
    assert.match(nearbySrc, /alignmentAccessibilityLabel/);
    assert.match(compatSrc, /alignmentAccessibilityLabel/);
    assert.match(ringSrc, /accessibilityElementsHidden/);
    assert.match(ringSrc, /formatAlignmentPercent\(geometry\.score\)/);
  });

  it('percent text is contractually centered in the square', () => {
    assert.match(ringSrc, /styles\.label/);
    assert.match(ringSrc, /alignItems:\s*'center'/);
    assert.match(ringSrc, /justifyContent:\s*'center'/);
    assert.match(ringSrc, /textAlign:\s*'center'/);
  });

  it('uses semicircle borders not a full progress ring fill', () => {
    assert.match(ringSrc, /borderTopColor:\s*color/);
    assert.match(ringSrc, /borderRightColor:\s*color/);
    assert.match(ringSrc, /borderBottomColor:\s*color/);
    assert.match(ringSrc, /borderLeftColor:\s*color/);
    assert.match(ringSrc, /borderColor:\s*'transparent'/);
    assert.doesNotMatch(
      ringSrc,
      /fullRing[\s\S]{0,80}borderColor:\s*color/,
    );
  });

  it('Profile card is a centered row with fixed ring', () => {
    assert.match(compatSrc, /flexDirection:\s*'row'/);
    assert.match(compatSrc, /alignItems:\s*'center'/);
    assert.match(compatSrc, /gap:\s*spacing\.lg/);
    assert.match(compatSrc, /variant="detail"/);
  });

  it('Nearby card keeps one Pressable and strong/full badges', () => {
    const renderStart = nearbySrc.indexOf('const renderCard');
    const renderEnd = nearbySrc.indexOf('\n  };', renderStart);
    const renderCard = nearbySrc.slice(renderStart, renderEnd);
    assert.equal((renderCard.match(/<Pressable/g) ?? []).length, 1);
    assert.equal(shouldShowNearbyTierBadge('strong'), true);
    assert.equal(shouldShowNearbyTierBadge('full'), true);
    assert.equal(shouldShowNearbyTierBadge('weak'), false);
    assert.equal(enAlignment.tiers.full, 'Rare alignment');
    assert.equal(es.alignment.tiers.full, 'Alineación excepcional');
  });
});
