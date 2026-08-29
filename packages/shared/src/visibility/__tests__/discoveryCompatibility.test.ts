/**
 * Discovery profile compatibility parsing + UI contract tests (Matching I2).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS,
  FORBIDDEN_DISCOVERY_COMPATIBILITY_KEYS,
  parseDiscoveryCompatibility,
} from '../discoveryCompatibility';
import {
  parseGetDiscoveryProfileResponse,
  VisibilityDiscoveryClientError,
} from '../callables';
import enDiscovery from '../../i18n/resources/discoveryProfile';
import es from '../../i18n/locales/es';

const ROOT = join(__dirname, '..', '..');
const SAMPLE_DETAIL = {
  mode: 'personal' as const,
  displayName: 'Alex R.',
  profileImage: null as string | null,
  occupation: 'Designer',
  interestIds: ['sports_outdoors_soccer'],
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

describe('parseDiscoveryCompatibility', () => {
  it('parses available score 97', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 97,
      formulaVersion: '1',
    });
    assert.deepEqual(parsed, {
      available: true,
      score: 97,
      formulaVersion: '1',
    });
  });

  it('parses score 0 and 100', () => {
    assert.deepEqual(
      parseDiscoveryCompatibility({
        available: true,
        score: 0,
        formulaVersion: '1',
      }),
      { available: true, score: 0, formulaVersion: '1' },
    );
    assert.deepEqual(
      parseDiscoveryCompatibility({
        available: true,
        score: 100,
        formulaVersion: '1',
      }),
      { available: true, score: 100, formulaVersion: '1' },
    );
  });

  it('parses score 1', () => {
    assert.deepEqual(
      parseDiscoveryCompatibility({
        available: true,
        score: 1,
        formulaVersion: '1',
      }),
      { available: true, score: 1, formulaVersion: '1' },
    );
  });

  it('rejects decimal score', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 97.5,
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, false);
  });

  it('rejects score below 0 or above 100', () => {
    for (const score of [-1, 101, 500]) {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score,
        formulaVersion: '1',
      });
      assert.equal(parsed?.available, false, `score ${score}`);
    }
  });

  it('rejects unknown formulaVersion', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 50,
      formulaVersion: '2',
    });
    assert.equal(parsed?.available, false);
  });

  it('rejects available=true with reason present', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 50,
      reason: 'embeddings-pending',
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, false);
  });

  it('parses unavailable with known V1 reason', () => {
    for (const reason of DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS) {
      const parsed = parseDiscoveryCompatibility({
        available: false,
        reason,
        formulaVersion: '1',
      });
      assert.equal(parsed?.available, false);
      if (parsed && !parsed.available) {
        assert.equal(parsed.reason, reason);
      }
    }
  });

  it('unknown reason degrades to unavailable without reason', () => {
    const parsed = parseDiscoveryCompatibility({
      available: false,
      reason: 'totally-unknown-reason',
      formulaVersion: '1',
    });
    assert.deepEqual(parsed, {
      available: false,
      formulaVersion: '1',
    });
  });

  it('returns undefined when compatibility field is absent', () => {
    assert.equal(parseDiscoveryCompatibility(undefined), undefined);
    assert.equal(parseDiscoveryCompatibility(null), undefined);
  });

  it('does not propagate forbidden internal keys from payload', () => {
    for (const key of ['vector', 'cosine', 'cacheKey', 'provider', 'model']) {
      const parsed = parseDiscoveryCompatibility({
        available: true,
        score: 80,
        formulaVersion: '1',
        [key]: 'secret',
      });
      assert.equal(parsed?.available, false);
      const json = JSON.stringify(parsed);
      assert.doesNotMatch(json, new RegExp(key, 'i'));
    }
  });

  it('ignores score when available=false', () => {
    const parsed = parseDiscoveryCompatibility({
      available: false,
      score: 99,
      reason: 'embeddings-pending',
      formulaVersion: '1',
    });
    assert.equal(parsed?.available, false);
    if (parsed && !parsed.available) {
      assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'score'), false);
    }
  });
});

describe('parseGetDiscoveryProfileResponse compatibility integration', () => {
  it('includes compatibility when present and valid', () => {
    const detail = parseGetDiscoveryProfileResponse(
      detailPayload({
        compatibility: { available: true, score: 97, formulaVersion: '1' },
      }),
    );
    assert.equal(detail.compatibility?.available, true);
    if (detail.compatibility?.available) {
      assert.equal(detail.compatibility.score, 97);
    }
  });

  it('omits compatibility when field absent (rollout)', () => {
    const detail = parseGetDiscoveryProfileResponse(detailPayload());
    assert.equal(
      Object.prototype.hasOwnProperty.call(detail, 'compatibility'),
      false,
    );
  });

  it('profile still parses when compatibility is invalid', () => {
    const detail = parseGetDiscoveryProfileResponse(
      detailPayload({
        compatibility: { available: true, score: 12.5, formulaVersion: '1' },
      }),
    );
    assert.equal(detail.profile.displayName, 'Alex R.');
    assert.equal(detail.compatibility?.available, false);
  });

  it('profile still parses when compatibility has corrupt/failed reason', () => {
    const detail = parseGetDiscoveryProfileResponse(
      detailPayload({
        compatibility: {
          available: false,
          reason: 'embedding-corrupt',
          formulaVersion: '1',
        },
      }),
    );
    assert.equal(detail.profile.displayName, 'Alex R.');
    assert.equal(detail.compatibility?.available, false);
  });

  it('profile error path remains independent — invalid profile still throws', () => {
    assert.throws(
      () =>
        parseGetDiscoveryProfileResponse(
          detailPayload({
            profile: { ...SAMPLE_DETAIL, displayName: '' },
            compatibility: { available: true, score: 50, formulaVersion: '1' },
          }),
        ),
      VisibilityDiscoveryClientError,
    );
  });
});

describe('Matching I2 UI contract (static)', () => {
  const compatPath = join(
    ROOT,
    'components/profileExploration/DiscoveryCompatibilityCard.tsx',
  );
  const screenPath = join(ROOT, 'screens/DiscoveryProfileScreen.tsx');
  const compatSrc = readFileSync(compatPath, 'utf8');
  const screenSrc = readFileSync(screenPath, 'utf8');

  it('renders available via backend score — no client recalculation', () => {
    assert.match(compatSrc, /compatibility\.available/);
    assert.match(compatSrc, /compatibility\.score/);
    assert.match(compatSrc, /discoveryProfile\.compatibilityMatch/);
    assert.doesNotMatch(compatSrc, /50\s*\/\s*30|cosine|Vertex|provider|model/i);
  });

  it('renders unavailable copy without technical reason codes', () => {
    assert.match(compatSrc, /discoveryProfile\.compatibilityUnavailable/);
    for (const reason of DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS) {
      assert.doesNotMatch(compatSrc, new RegExp(reason));
    }
    assert.doesNotMatch(screenSrc, /embeddings-/);
  });

  it('hides card when compatibility is absent (rollout)', () => {
    assert.match(compatSrc, /if \(!compatibility\)/);
    assert.match(screenSrc, /compatibility=\{data\.compatibility\}/);
  });

  it('never surfaces forbidden internal keys in component', () => {
    for (const key of FORBIDDEN_DISCOVERY_COMPATIBILITY_KEYS) {
      assert.doesNotMatch(compatSrc, new RegExp(`\\b${key}\\b`));
    }
  });

  it('VoiceOver announces full percent match', () => {
    assert.match(compatSrc, /a11yCompatibilityMatch/);
    assert.match(compatSrc, /accessibilityLabel=\{a11yLabel\}/);
    assert.match(compatSrc, /accessibilityLabel=\{unavailableCopy\}/);
  });

  it('does not rely on color alone — score and title text present', () => {
    assert.match(compatSrc, /\$\{score\}%/);
    assert.match(compatSrc, /matchLabel/);
    assert.match(compatSrc, /maxFontSizeMultiplier/);
  });
});

describe('Matching I2 i18n EN/ES', () => {
  it('exposes match label and unavailable copy', () => {
    assert.equal(enDiscovery.compatibilityMatch, '{{score}}% Match');
    assert.equal(
      enDiscovery.compatibilityUnavailable,
      'Match score is being prepared.',
    );
    assert.equal(
      es.discoveryProfile.compatibilityMatch,
      '{{score}}% Match',
    );
    assert.equal(
      es.discoveryProfile.compatibilityUnavailable,
      'Estamos preparando la compatibilidad.',
    );
    assert.match(enDiscovery.a11yCompatibilityMatch, /percent match/i);
    assert.match(
      es.discoveryProfile.a11yCompatibilityMatch,
      /por ciento/i,
    );
  });

  it('i18n strings never embed technical reason codes', () => {
    const bundle = JSON.stringify({ en: enDiscovery, es: es.discoveryProfile });
    for (const reason of DISCOVERY_COMPATIBILITY_UNAVAILABLE_REASONS) {
      assert.doesNotMatch(bundle, new RegExp(reason));
    }
  });
});
