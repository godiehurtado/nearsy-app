/**
 * IOS-208-COPY-COMPAT-01 (C) — the client accepts backend scores tagged
 * formulaVersion '1' (production today) or '2' (future formula) and renders
 * them identically. Unknown / missing versions and invalid scores stay hidden.
 * The client never computes or reorders by score.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPPORTED_DISCOVERY_COMPATIBILITY_FORMULA_VERSIONS,
  compatibilityForNearbyList,
  isSupportedDiscoveryCompatibilityFormulaVersion,
  parseDiscoveryCompatibility,
  toAlignment,
} from '../discoveryCompatibility';
import {
  parseDiscoverNearbyResponse,
  parseGetDiscoveryProfileResponse,
} from '../callables';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (rel: string) =>
  readFileSync(join(here, '..', '..', rel), 'utf8');

const SAMPLE_PROFILE = {
  mode: 'personal' as const,
  displayName: 'Alex R.',
  profileImage: null as string | null,
  occupation: 'Designer',
  interestIds: ['sports_outdoors_soccer'],
};

function nearbyResult(uid: string, distanceMeters: number, compatibility?: unknown) {
  return {
    uid,
    distanceMeters,
    profile: SAMPLE_PROFILE,
    ...(compatibility !== undefined ? { compatibility } : {}),
  };
}

function nearbyPayload(results: unknown[]) {
  return { contractVersion: 1, results, nextCursor: null, serverTime: 50 };
}

describe('supported formula versions', () => {
  it('accepts exactly "1" and "2"', () => {
    assert.deepEqual([...SUPPORTED_DISCOVERY_COMPATIBILITY_FORMULA_VERSIONS], ['1', '2']);
    for (const v of ['1', '2']) {
      assert.equal(isSupportedDiscoveryCompatibilityFormulaVersion(v), true, v);
    }
    for (const v of ['0', '3', '10', 'v2', '2.0', ' 2', '', 1, 2, null, undefined, {}]) {
      assert.equal(isSupportedDiscoveryCompatibilityFormulaVersion(v), false, String(v));
    }
  });
});

describe('formulaVersion "1" (production) — unchanged', () => {
  it('available score parses exactly as before', () => {
    assert.deepEqual(
      parseDiscoveryCompatibility({ available: true, score: 66, formulaVersion: '1' }),
      { available: true, score: 66, formulaVersion: '1' },
    );
  });

  it('tier metadata still parses', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 80,
      alignmentTier: 'strong',
      alignmentVersion: '1',
      formulaVersion: '1',
    });
    assert.deepEqual(parsed, {
      available: true,
      score: 80,
      formulaVersion: '1',
      alignmentVersion: '1',
      alignmentTier: 'strong',
    });
  });
});

describe('formulaVersion "2" (future) — shown as sent', () => {
  it('available score is preserved and tagged "2"', () => {
    assert.deepEqual(
      parseDiscoveryCompatibility({ available: true, score: 73, formulaVersion: '2' }),
      { available: true, score: 73, formulaVersion: '2' },
    );
  });

  it('boundaries 0 and 100 are accepted', () => {
    for (const score of [0, 100]) {
      const parsed = parseDiscoveryCompatibility({ available: true, score, formulaVersion: '2' });
      assert.equal(parsed?.available, true);
      if (parsed?.available) assert.equal(parsed.score, score);
    }
  });

  it('unavailable with known reason keeps the reason', () => {
    assert.deepEqual(
      parseDiscoveryCompatibility({
        available: false,
        reason: 'embeddings-pending',
        formulaVersion: '2',
      }),
      { available: false, formulaVersion: '2', reason: 'embeddings-pending' },
    );
  });

  it('renders the same Alignment as v1 for the same score and tier', () => {
    const wire = { available: true, score: 91, alignmentTier: 'full', alignmentVersion: '1' };
    const v1 = toAlignment(parseDiscoveryCompatibility({ ...wire, formulaVersion: '1' }));
    const v2 = toAlignment(parseDiscoveryCompatibility({ ...wire, formulaVersion: '2' }));
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2, { available: true, score: 91, tier: 'full' });
  });

  it('formula 2 + alignmentVersion 1 shows percentage and category', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 72,
      alignmentTier: 'strong',
      alignmentVersion: '1',
      formulaVersion: '2',
    });
    assert.deepEqual(parsed, {
      available: true,
      score: 72,
      formulaVersion: '2',
      alignmentVersion: '1',
      alignmentTier: 'strong',
    });
    assert.deepEqual(toAlignment(parsed), { available: true, score: 72, tier: 'strong' });
    assert.equal(compatibilityForNearbyList({
      available: true,
      score: 72,
      alignmentTier: 'strong',
      alignmentVersion: '1',
      formulaVersion: '2',
    })?.alignmentTier, 'strong');
  });

  it('formula 2 + unknown alignmentVersion keeps the score, hides the category', () => {
    for (const alignmentVersion of ['2', 'x', 2, undefined]) {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score: 72,
        alignmentTier: 'strong',
        alignmentVersion,
        formulaVersion: '2',
      });
      assert.deepEqual(toAlignment(parsed), { available: true, score: 72, tier: undefined });
    }
  });

  it('Nearby list ring shows v2 like v1', () => {
    assert.equal(
      compatibilityForNearbyList({ available: true, score: 40, formulaVersion: '2' })?.score,
      40,
    );
  });
});

describe('unknown or missing formulaVersion — hidden', () => {
  for (const formulaVersion of ['3', '0', 'v2', 2, null]) {
    it(`formulaVersion ${JSON.stringify(formulaVersion)} → unavailable, no score`, () => {
      const parsed = parseDiscoveryCompatibility({ available: true, score: 88, formulaVersion });
      assert.equal(parsed?.available, false);
      assert.doesNotMatch(JSON.stringify(parsed), /88/);
      assert.equal(compatibilityForNearbyList({ available: true, score: 88, formulaVersion }), undefined);
      assert.deepEqual(toAlignment(parsed), { available: false, presentation: 'unavailable' });
    });
  }

  it('missing formulaVersion → unavailable', () => {
    const parsed = parseDiscoveryCompatibility({ available: true, score: 88 });
    assert.equal(parsed?.available, false);
    assert.equal(compatibilityForNearbyList({ available: true, score: 88 }), undefined);
  });

  it('missing compatibility block stays undefined (older profiles)', () => {
    assert.equal(parseDiscoveryCompatibility(undefined), undefined);
    assert.equal(toAlignment(undefined), undefined);
  });
});

describe('invalid score — hidden for both versions', () => {
  for (const formulaVersion of ['1', '2']) {
    for (const score of [-1, 101, 66.5, NaN, Infinity, '66', null]) {
      it(`v${formulaVersion} score ${String(score)} → unavailable`, () => {
        const parsed = parseDiscoveryCompatibility({ available: true, score, formulaVersion });
        assert.equal(parsed?.available, false);
      });
    }
  }

  it('v2 payload with forbidden internal keys is rejected', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 50,
      formulaVersion: '2',
      dimensionScores: { interests: 0.6 },
    });
    assert.equal(parsed?.available, false);
    assert.doesNotMatch(JSON.stringify(parsed), /dimensionScores/);
  });
});

describe('Discovery responses — mixed versions, order preserved', () => {
  it('Nearby keeps backend order and only hides unusable scores', () => {
    const response = parseDiscoverNearbyResponse(
      nearbyPayload([
        nearbyResult('u-far-v2', 900, { available: true, score: 95, formulaVersion: '2' }),
        nearbyResult('u-near-v1', 10, { available: true, score: 20, formulaVersion: '1' }),
        nearbyResult('u-unknown', 50, { available: true, score: 70, formulaVersion: '9' }),
        nearbyResult('u-legacy', 30),
      ]),
    );
    assert.deepEqual(
      response.results.map((r) => r.uid),
      ['u-far-v2', 'u-near-v1', 'u-unknown', 'u-legacy'],
    );
    const [v2, v1, unknown, legacy] = response.results;
    assert.equal(v2.compatibility?.available && v2.compatibility.score, 95);
    assert.equal(v1.compatibility?.available && v1.compatibility.score, 20);
    assert.equal(unknown.compatibility?.available, false);
    assert.equal(legacy.compatibility, undefined);
  });

  it('Discovery Profile parses a v2 score and an existing v1 profile', () => {
    for (const formulaVersion of ['1', '2']) {
      const detail = parseGetDiscoveryProfileResponse({
        contractVersion: 1,
        uid: 'a',
        distanceMeters: 5,
        profile: { ...SAMPLE_PROFILE, company: 'Nearsy', bio: 'Hello' },
        gallery: [],
        serverTime: 50,
        compatibility: { available: true, score: 64, formulaVersion },
      });
      assert.equal(detail.profile.displayName, 'Alex R.');
      assert.deepEqual(toAlignment(detail.compatibility), {
        available: true,
        score: 64,
        tier: undefined,
      });
    }
  });
});

describe('client never computes or ranks by score', () => {
  it('parser passes the backend score through without arithmetic', () => {
    const src = readShared('visibility/discoveryCompatibility.ts');
    const body = src.slice(src.indexOf('function parseAvailableCompatibility'));
    const block = body.slice(0, body.search(/\r?\n\}\r?\n/));
    assert.match(block, /score,\s+formulaVersion,/);
    assert.doesNotMatch(block, /score\s*[*/+-]|Math\.(round|floor|ceil)|weight/);
  });

  it('Nearby candidate ordering is distance then uid, never compatibility', () => {
    const filters = readShared('visibility/filters.ts');
    assert.match(filters, /sort\(compareCandidatesByDistanceThenUid\)/);
    assert.doesNotMatch(filters, /compatibility/);
  });
});
