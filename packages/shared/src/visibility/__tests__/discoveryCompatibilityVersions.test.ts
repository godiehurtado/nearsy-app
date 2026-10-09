/**
 * Match compatibility — formulaVersion '1' and '2' share one display contract.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/visibility/__tests__/discoveryCompatibilityVersions.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DISCOVERY_COMPATIBILITY_FORMULA_VERSIONS,
  compatibilityForNearbyList,
  parseDiscoveryCompatibility,
  toAlignment,
} from '../discoveryCompatibility.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

function shown(value: unknown): number | undefined {
  const alignment = toAlignment(parseDiscoveryCompatibility(value));
  return alignment?.available ? alignment.score : undefined;
}

describe('supported formula versions', () => {
  it('accepts exactly "1" and "2"', () => {
    assert.deepEqual([...DISCOVERY_COMPATIBILITY_FORMULA_VERSIONS], ['1', '2']);
  });

  for (const version of ['1', '2'] as const) {
    it(`v${version}: score and tier are shown as sent`, () => {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score: 73,
        alignmentTier: 'strong',
        alignmentVersion: '1',
        formulaVersion: version,
      });
      assert.deepEqual(parsed, {
        available: true,
        score: 73,
        formulaVersion: version,
        alignmentVersion: '1',
        alignmentTier: 'strong',
      });
      assert.deepEqual(toAlignment(parsed), { available: true, score: 73, tier: 'strong' });
      assert.equal(compatibilityForNearbyList(parsed && { ...parsed })?.score, 73);
    });

    it(`v${version}: unavailable keeps the presentation bucket`, () => {
      const parsed = parseDiscoveryCompatibility({
        available: false,
        reason: 'embeddings-pending',
        formulaVersion: version,
      });
      assert.deepEqual(parsed, {
        available: false,
        formulaVersion: version,
        reason: 'embeddings-pending',
      });
      assert.deepEqual(toAlignment(parsed), { available: false, state: 'processing' });
    });
  }

  it('v1 and v2 render the same score through the current UI model', () => {
    for (const score of [0, 1, 50, 99, 100]) {
      assert.equal(shown({ available: true, score, formulaVersion: '1' }), score);
      assert.equal(shown({ available: true, score, formulaVersion: '2' }), score);
    }
  });
});

describe('unknown or missing formula version is rejected', () => {
  for (const formulaVersion of ['3', '0', 'v2', '2.0', ' 2', '', 2, 1, null, true, {}]) {
    it(`formulaVersion ${JSON.stringify(formulaVersion)} → no score`, () => {
      const parsed = parseDiscoveryCompatibility({ available: true, score: 80, formulaVersion });
      assert.equal(parsed?.available, false);
      assert.equal(shown({ available: true, score: 80, formulaVersion }), undefined);
      assert.equal(
        compatibilityForNearbyList({ available: true, score: 80, formulaVersion }),
        undefined,
      );
    });
  }

  it('missing formulaVersion → no score', () => {
    assert.equal(parseDiscoveryCompatibility({ available: true, score: 80 })?.available, false);
    assert.equal(compatibilityForNearbyList({ available: true, score: 80 }), undefined);
  });

  it('missing compatibility → nothing rendered', () => {
    assert.equal(parseDiscoveryCompatibility(undefined), undefined);
    assert.equal(parseDiscoveryCompatibility(null), undefined);
    assert.equal(toAlignment(undefined), undefined);
    assert.equal(compatibilityForNearbyList(undefined), undefined);
  });
});

describe('invalid score never renders', () => {
  for (const version of ['1', '2'] as const) {
    for (const score of [-1, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY, '50', null, undefined]) {
      it(`v${version} score ${String(score)} → unavailable`, () => {
        const parsed = parseDiscoveryCompatibility({ available: true, score, formulaVersion: version });
        assert.equal(parsed?.available, false);
        assert.equal(shown({ available: true, score, formulaVersion: version }), undefined);
      });
    }
  }

  it('v2 with forbidden internals is rejected and not propagated', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 70,
      formulaVersion: '2',
      dimensionScores: { interests: 0.6 },
    });
    assert.equal(parsed?.available, false);
    assert.doesNotMatch(JSON.stringify(parsed), /dimensionScores|interests/);
  });
});

describe('existing profiles keep working', () => {
  const existing: Array<[string, unknown, number | undefined]> = [
    ['v1 with tier', { available: true, score: 66, alignmentTier: 'strong', alignmentVersion: '1', formulaVersion: '1' }, 66],
    ['v1 legacy score only', { available: true, score: 42, formulaVersion: '1' }, 42],
    ['v1 real zero', { available: true, score: 0, formulaVersion: '1' }, 0],
    ['v1 unavailable', { available: false, reason: 'mode-incomplete', formulaVersion: '1' }, undefined],
    ['profile without compatibility', undefined, undefined],
  ];

  for (const [name, value, expected] of existing) {
    it(name, () => {
      assert.equal(shown(value), expected);
    });
  }
});

describe('the client never computes the match', () => {
  const contract = read('visibility/discoveryCompatibility.ts');

  it('score comes straight from the backend payload', () => {
    assert.match(contract, /const score = value\.score;/);
    assert.doesNotMatch(contract, /Math\.(round|floor|ceil|min|max)\(/);
    assert.doesNotMatch(contract, /\*\s*0\.\d|0\.\d+\s*\*/);
    assert.doesNotMatch(contract, /interestIds|languageCodes|birthCountryCode|residenceCountryCode/);
  });

  it('UI consumers read the parsed score and do not derive one', () => {
    for (const rel of [
      'components/profileExploration/DiscoveryCompatibilityCard.tsx',
      'components/profileExploration/CompactAlignmentBadge.tsx',
      'screens/NearbySearchScreen.tsx',
    ]) {
      const src = read(rel);
      assert.match(src, /toAlignment\(/, rel);
      assert.doesNotMatch(src, /formulaVersion/, rel);
    }
  });
});
