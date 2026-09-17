/**
 * ENH-PROFILE-01 — profile context catalogs, wire parsing, CRJ rules,
 * sync flow, and Discovery presentation contracts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  countryCodeToFlagEmoji,
  filterCountries,
  getCountryDisplayName,
  normalizeCountryCode,
  resolveCountryOption,
} from '../profile/countryCatalog';
import {
  MAX_PROFILE_LANGUAGES,
  filterLanguages,
  getLanguageDisplayName,
  normalizeLanguageCode,
  normalizeLanguageCodes,
} from '../profile/languageCatalog';
import {
  areProfileContextFieldsComplete,
  buildProfileContextWritePatch,
  isCrjProfileContextCountriesValid,
  isCrjProfileContextLanguagesValid,
  parseUserProfileContext,
} from '../profile/profileContextFields';
import { parseZodiacSign, zodiacSymbol } from '../profile/zodiacSign';
import {
  parseDiscoveryCompatibility,
  toAlignment,
} from '../visibility/discoveryCompatibility';
import { resolveInterestChips } from '../visibility/interestDisplay';
import {
  parseGetDiscoveryProfileResponse,
  VisibilityDiscoveryClientError,
} from '../visibility/callables';
import { createFakeVisibilityDiscoveryClient } from '../visibility/callables/fakeClient';
import { syncDiscoveryProfileContextFlow } from '../visibility/syncDiscoveryProfileContext';

const ROOT = join(__dirname, '..');

function detailPayload(extra: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    uid: 'peer',
    distanceMeters: 42,
    profile: {
      mode: 'personal',
      displayName: 'Alex R.',
      profileImage: null,
      occupation: 'Designer',
      interestIds: ['technology_ai', 'travel_international', 'sports_soccer'],
      company: '',
      bio: 'Hello',
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
      languageCodes: ['es', 'en'],
      zodiacSign: 'virgo',
    },
    gallery: [],
    socialLinks: [],
    affiliations: [],
    serverTime: 50,
    ...extra,
  };
}

describe('ENH-PROFILE-01 country catalog', () => {
  it('resolves ISO code to localized name + flag', () => {
    const opt = resolveCountryOption('CO', 'en');
    assert.ok(opt);
    assert.equal(opt!.code, 'CO');
    assert.equal(opt!.name, 'Colombia');
    assert.equal(opt!.flag, countryCodeToFlagEmoji('CO'));
    assert.equal(opt!.flag, '🇨🇴');
  });

  it('localizes US for EN and ES', () => {
    assert.equal(getCountryDisplayName('US', 'en'), 'United States');
    assert.equal(getCountryDisplayName('US', 'es'), 'Estados Unidos');
    assert.equal(getCountryDisplayName('US', 'es-CO'), 'Estados Unidos');
  });

  it('filters countries by localized search query', () => {
    const hitsEn = filterCountries('colombia', 'en');
    assert.ok(hitsEn.some((h) => h.code === 'CO' && h.name === 'Colombia'));
    const hitsEs = filterCountries('estados unidos', 'es');
    assert.ok(
      hitsEs.some((h) => h.code === 'US' && h.name === 'Estados Unidos'),
    );
  });

  it('handles unknown country codes safely', () => {
    assert.equal(normalizeCountryCode('ZZ'), null);
    assert.equal(normalizeCountryCode('colombia'), null);
    assert.equal(resolveCountryOption('ZZ', 'en'), null);
  });

  it('never depends on Intl.DisplayNames', () => {
    const src = readFileSync(
      join(__dirname, '../profile/countryCatalog.ts'),
      'utf8',
    );
    assert.doesNotMatch(src, /Intl\.DisplayNames/);
  });
});

describe('ENH-PROFILE-01 language catalog', () => {
  it('localizes language codes for EN and ES', () => {
    assert.equal(getLanguageDisplayName('es', 'en'), 'Spanish');
    assert.equal(getLanguageDisplayName('es', 'es'), 'Español');
    assert.equal(getLanguageDisplayName('en', 'en'), 'English');
    assert.equal(getLanguageDisplayName('en', 'es'), 'Inglés');
  });

  it('filters languages by localized search query', () => {
    const hitsEn = filterLanguages('span', 'en');
    assert.ok(hitsEn.some((h) => h.code === 'es' && h.name === 'Spanish'));
    const hitsEs = filterLanguages('espa', 'es');
    assert.ok(hitsEs.some((h) => h.code === 'es' && h.name === 'Español'));
  });

  it('filters languages and keeps canonical codes', () => {
    const hits = filterLanguages('span', 'en');
    assert.ok(hits.some((h) => h.code === 'es'));
    assert.equal(normalizeLanguageCode('ES'), 'es');
    assert.equal(getLanguageDisplayName('es', 'en').length > 0, true);
  });

  it('multi-select normalize dedupes and caps at 10', () => {
    const codes = normalizeLanguageCodes([
      'en',
      'es',
      'pt',
      'fr',
      'de',
      'it',
      'ja',
      'ko',
      'zh',
      'ar',
      'hi',
      'ru',
      'en',
    ]);
    assert.equal(codes.length, MAX_PROFILE_LANGUAGES);
    assert.deepEqual(new Set(codes).size, codes.length);
  });

  it('deselect semantics: normalize drops invalid and empty', () => {
    assert.deepEqual(normalizeLanguageCodes(['en', 'nope', 'es']), [
      'en',
      'es',
    ]);
    assert.deepEqual(normalizeLanguageCodes([]), []);
  });

  it('never depends on Intl.DisplayNames', () => {
    const src = readFileSync(
      join(__dirname, '../profile/languageCatalog.ts'),
      'utf8',
    );
    assert.doesNotMatch(src, /Intl\.DisplayNames/);
  });
});

describe('ENH-PROFILE-01 profile context fields', () => {
  it('parses missing context safely', () => {
    assert.deepEqual(parseUserProfileContext({}), {
      birthCountryCode: null,
      residenceCountryCode: null,
      languageCodes: [],
    });
  });

  it('write patch never includes zodiacSign and keeps canonical codes', () => {
    const patch = buildProfileContextWritePatch({
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
      languageCodes: ['es', 'en'],
    });
    assert.equal(patch.birthCountryCode, 'CO');
    assert.equal(patch.residenceCountryCode, 'US');
    assert.deepEqual(patch.languageCodes, ['es', 'en']);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'zodiacSign'), false);
    // Display labels must not leak into persistence.
    assert.notEqual(patch.birthCountryCode, 'Colombia');
    assert.notEqual((patch.languageCodes as string[])[0], 'Spanish');
  });

  it('CRJ requires countries and >=1 language, max 10', () => {
    assert.equal(isCrjProfileContextCountriesValid('CO', 'US'), true);
    assert.equal(isCrjProfileContextCountriesValid(null, 'US'), false);
    assert.equal(isCrjProfileContextLanguagesValid(['es']), true);
    assert.equal(isCrjProfileContextLanguagesValid([]), false);
    assert.equal(
      isCrjProfileContextLanguagesValid([
        'en',
        'es',
        'pt',
        'fr',
        'de',
        'it',
        'ja',
        'ko',
        'zh',
        'ar',
        'hi',
      ]),
      true,
    ); // normalize caps to 10 then valid
    assert.equal(
      areProfileContextFieldsComplete({
        birthCountryCode: 'CO',
        residenceCountryCode: 'US',
        languageCodes: ['es'],
      }),
      true,
    );
  });
});

describe('ENH-PROFILE-01 Discovery wire parsing', () => {
  it('Detail parses countries/languages/zodiac and keeps distanceMeters', () => {
    const parsed = parseGetDiscoveryProfileResponse(detailPayload());
    assert.equal(parsed.distanceMeters, 42);
    assert.equal(parsed.profile.birthCountryCode, 'CO');
    assert.equal(parsed.profile.residenceCountryCode, 'US');
    assert.deepEqual(parsed.profile.languageCodes, ['es', 'en']);
    assert.equal(parsed.profile.zodiacSign, 'virgo');
  });

  it('missing context parses safely', () => {
    const parsed = parseGetDiscoveryProfileResponse(
      detailPayload({
        profile: {
          mode: 'personal',
          displayName: 'Alex R.',
          profileImage: null,
          occupation: 'Designer',
          interestIds: [],
          company: '',
          bio: '',
        },
      }),
    );
    assert.equal(parsed.profile.birthCountryCode, null);
    assert.equal(parsed.profile.residenceCountryCode, null);
    assert.deepEqual(parsed.profile.languageCodes, []);
    assert.equal(parsed.profile.zodiacSign, null);
  });

  it('public Detail rejects DOB fields', () => {
    assert.throws(
      () =>
        parseGetDiscoveryProfileResponse(
          detailPayload({
            profile: {
              mode: 'personal',
              displayName: 'Alex',
              profileImage: null,
              occupation: '',
              interestIds: [],
              company: '',
              bio: '',
              birthDate: '1990-01-01',
            },
          }),
        ),
      /birthDate|invalid/i,
    );
  });
});

describe('ENH-PROFILE-01 syncDiscoveryProfileContext', () => {
  it('synced:false is ok and does not throw', async () => {
    const client = createFakeVisibilityDiscoveryClient({
      syncDiscoveryProfileContext: async () => ({
        contractVersion: 1,
        synced: false,
        serverTime: 1,
      }),
    });
    const outcome = await syncDiscoveryProfileContextFlow(client);
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.response.synced, false);
  });

  it('transport error surfaces as ok:false', async () => {
    const client = createFakeVisibilityDiscoveryClient({
      syncDiscoveryProfileContext: async () => {
        throw new VisibilityDiscoveryClientError({
          code: 'unavailable',
          message: 'down',
          retryable: true,
        });
      },
    });
    const outcome = await syncDiscoveryProfileContextFlow(client);
    assert.equal(outcome.ok, false);
  });
});

describe('ENH-PROFILE-01 Alignment + interests regression', () => {
  it('available score 0 remains real 0%', () => {
    const parsed = parseDiscoveryCompatibility({
      available: true,
      score: 0,
      formulaVersion: '1',
      alignmentTier: 'weak',
      alignmentVersion: '1',
    });
    const alignment = toAlignment(parsed);
    assert.equal(alignment?.available, true);
    if (alignment?.available) assert.equal(alignment.score, 0);
  });

  it('unavailable reasons keep presentation buckets', () => {
    const insufficient = toAlignment(
      parseDiscoveryCompatibility({
        available: false,
        reason: 'insufficient-comparable-dimensions',
        formulaVersion: '1',
      }),
    );
    assert.equal(insufficient?.available, false);
    if (insufficient && !insufficient.available) {
      assert.equal(insufficient.presentation, 'insufficient');
    }
  });

  it('public interests remain full set, not viewer intersection', () => {
    const explored = [
      'technology_ai',
      'travel_international',
      'sports_soccer',
    ];
    const pills = resolveInterestChips(explored, (_k, fb) => fb);
    assert.deepEqual(
      pills.map((p) => p.id),
      explored,
    );
  });

  it('zodiac symbol resolves for known signs', () => {
    assert.equal(parseZodiacSign('virgo'), 'virgo');
    assert.equal(zodiacSymbol('virgo'), '♍');
    assert.equal(parseZodiacSign('not-a-sign'), null);
  });
});

describe('ENH-PROFILE-01 Discovery UI contract (static)', () => {
  const screenSrc = readFileSync(
    join(ROOT, 'screens/DiscoveryProfileScreen.tsx'),
    'utf8',
  );
  const headerSrc = readFileSync(
    join(ROOT, 'components/profile/DiscoveryProfileHeader.tsx'),
    'utf8',
  );
  const crjSrc = readFileSync(
    join(ROOT, 'screens/ProfileCompletionScreen.tsx'),
    'utf8',
  );
  const editSrc = readFileSync(
    join(ROOT, 'screens/CompleteProfileScreen.tsx'),
    'utf8',
  );
  const contextFieldsSrc = readFileSync(
    join(ROOT, 'profile/profileContextFields.ts'),
    'utf8',
  );

  it('does not render distance on Discovery Profile', () => {
    assert.doesNotMatch(screenSrc, /distanceAwayFt|distanceAwayM|distanceLabel/);
    assert.match(headerSrc, /Distance is intentionally omitted/);
  });

  it('uses DiscoveryProfileHeader + ProfileContextCard; no large compatibility card', () => {
    assert.match(screenSrc, /DiscoveryProfileHeader/);
    assert.match(screenSrc, /ProfileContextCard/);
    assert.doesNotMatch(screenSrc, /DiscoveryCompatibilityCard/);
  });

  it('header supports zodiac omit when null and compact alignment', () => {
    assert.match(headerSrc, /zodiacSign/);
    assert.match(headerSrc, /AlignmentScoreRing/);
    assert.match(headerSrc, /alignmentUnavailableLabel/);
  });

  it('keeps all public interests via resolveInterestChips', () => {
    assert.match(screenSrc, /resolveInterestChips/);
    assert.doesNotMatch(screenSrc, /intersectOnboardingInterestIds/);
  });

  it('CRJ never requests zodiac and requires countries/languages', () => {
    assert.doesNotMatch(crjSrc, /zodiacSign/);
    assert.match(crjSrc, /isCrjProfileContextCountriesValid/);
    assert.match(crjSrc, /isCrjProfileContextLanguagesValid/);
    assert.match(crjSrc, /CountrySearchField/);
    assert.match(crjSrc, /LanguageMultiSelectField/);
  });

  it('Edit Profile saves context + syncDiscoveryProfileContext', () => {
    assert.match(editSrc, /buildOwnProfileContextSavePatch/);
    assert.match(editSrc, /syncDiscoveryProfileContextFlow/);
    assert.match(editSrc, /OwnProfileContextCard/);
  });

  it('context write patch forbids zodiacSign', () => {
    assert.match(contextFieldsSrc, /Never include zodiacSign/);
  });
});
