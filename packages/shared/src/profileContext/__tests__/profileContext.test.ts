/**
 * ENH-PROFILE-01 — Profile Context catalogs, fields, discovery parse, sync.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildCountrySearchEntries,
  countryDisplayName,
  countryFlagEmoji,
  findCountryEntry,
  normalizeCountryCode,
  searchCountryEntries,
} from '../countryCatalog';
import {
  canAddLanguageCode,
  languageDisplayName,
  MAX_PROFILE_LANGUAGE_CODES,
  normalizeLanguageCode,
  normalizeLanguageCodes,
  searchLanguageEntries,
  buildLanguageSearchEntries,
} from '../languageCatalog';
import {
  buildProfileContextSavePatch,
  hasAnyDiscoveryContext,
  isCrjIdentityContextValid,
  isCrjLanguagesValid,
  profileContextSaveOmitsZodiac,
  readProfileContextFromUserDoc,
  syncDiscoveryProfileContextAfterSave,
} from '../index';
import { parseZodiacSign, zodiacSymbol } from '../zodiacPresentation';
import {
  parseDiscoveryProfileDetail,
  parseDiscoveryProfileSummary,
  parseGetDiscoveryProfileResponse,
} from '../../visibility/callables/parse';
import { createFakeVisibilityDiscoveryClient } from '../../visibility/callables/fakeClient';
import { CONTRACT_VERSION } from '../../visibility/constants';
import { toAlignment } from '../../visibility/discoveryCompatibility';
import { mapUnavailableReasonToAlignmentState } from '../../visibility/discoveryCompatibility';

describe('profile context countries', () => {
  it('filters search and resolves label + flag', () => {
    const entries = buildCountrySearchEntries('en');
    const co = findCountryEntry(entries, 'CO');
    assert.ok(co);
    assert.equal(co!.code, 'CO');
    assert.ok(co!.flag.includes('🇨🇴') || co!.flag.length > 0);
    assert.ok(countryDisplayName('CO', 'en').length > 0);
    assert.equal(countryFlagEmoji('ZZ'), '');
    const filtered = searchCountryEntries(entries, 'colom');
    assert.ok(filtered.some((e) => e.code === 'CO'));
  });

  it('unknown code is safe', () => {
    assert.equal(normalizeCountryCode('XX'), null);
    assert.equal(normalizeCountryCode(null), null);
  });
});

describe('profile context EN/ES label parity (Hermes-safe maps)', () => {
  it('maps country codes to localized labels', () => {
    assert.equal(countryDisplayName('CO', 'en'), 'Colombia');
    assert.equal(countryDisplayName('US', 'en'), 'United States');
    assert.equal(countryDisplayName('US', 'es'), 'Estados Unidos');
    assert.equal(countryDisplayName('US', 'es-CO'), 'Estados Unidos');
  });

  it('maps language codes to localized labels', () => {
    assert.equal(languageDisplayName('es', 'en'), 'Spanish');
    assert.equal(languageDisplayName('es', 'es'), 'Español');
    assert.equal(languageDisplayName('en', 'en'), 'English');
    assert.equal(languageDisplayName('en', 'es'), 'Inglés');
  });

  it('country search works by localized name', () => {
    const en = buildCountrySearchEntries('en');
    assert.ok(searchCountryEntries(en, 'united states').some((e) => e.code === 'US'));
    const es = buildCountrySearchEntries('es');
    assert.ok(searchCountryEntries(es, 'estados unidos').some((e) => e.code === 'US'));
  });

  it('language search works by localized name', () => {
    const en = buildLanguageSearchEntries('en');
    assert.ok(
      searchLanguageEntries(en, 'spanish', new Set()).some((e) => e.code === 'es'),
    );
    const es = buildLanguageSearchEntries('es');
    assert.ok(
      searchLanguageEntries(es, 'español', new Set()).some((e) => e.code === 'es'),
    );
  });

  it('persistence remains canonical ISO / BCP-47 codes', () => {
    assert.equal(normalizeCountryCode('co'), 'CO');
    assert.equal(normalizeLanguageCode('ES'), 'es');
    const patch = buildProfileContextSavePatch({
      birthCountryCode: 'co',
      residenceCountryCode: 'us',
      languageCodes: ['ES', 'EN'],
    });
    assert.deepEqual(patch, {
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
      languageCodes: ['es', 'en'],
    });
  });

  it('runtime catalogs never call Intl.DisplayNames', () => {
    const countrySrc = readFileSync(
      join(__dirname, '../countryCatalog.ts'),
      'utf8',
    );
    const languageSrc = readFileSync(
      join(__dirname, '../languageCatalog.ts'),
      'utf8',
    );
    assert.doesNotMatch(countrySrc, /new Intl\.DisplayNames/);
    assert.doesNotMatch(languageSrc, /new Intl\.DisplayNames/);
  });
});

describe('profile context languages', () => {
  it('search/multi-select/deselect/canonical/max 10', () => {
    const catalog = buildLanguageSearchEntries('en');
    const selected = new Set<string>();
    const hits = searchLanguageEntries(catalog, 'span', selected);
    assert.ok(hits.some((e) => e.code === 'es'));
    assert.equal(normalizeLanguageCode('ES'), 'es');
    assert.equal(normalizeLanguageCode('nope'), null);

    let codes: string[] = [];
    for (const code of [
      'en',
      'es',
      'pt',
      'fr',
      'de',
      'it',
      'nl',
      'pl',
      'ru',
      'uk',
      'ja',
    ]) {
      if (canAddLanguageCode(codes, code)) {
        codes = [...codes, normalizeLanguageCode(code)!];
      }
    }
    assert.equal(codes.length, MAX_PROFILE_LANGUAGE_CODES);
    assert.equal(canAddLanguageCode(codes, 'ja'), false);
    codes = codes.filter((c) => c !== 'es');
    assert.ok(!codes.includes('es'));
    assert.deepEqual(
      normalizeLanguageCodes(['en', 'en', 'zz', 'es']),
      ['en', 'es'],
    );
  });
});

describe('profile context CRJ validation', () => {
  it('requires birth + residence countries', () => {
    assert.equal(
      isCrjIdentityContextValid({
        birthCountryCode: 'CO',
        residenceCountryCode: 'US',
      }),
      true,
    );
    assert.equal(
      isCrjIdentityContextValid({
        birthCountryCode: null,
        residenceCountryCode: 'US',
      }),
      false,
    );
  });

  it('requires >=1 and <=10 languages; never asks zodiac', () => {
    assert.equal(isCrjLanguagesValid([]), false);
    assert.equal(isCrjLanguagesValid(['en']), true);
    assert.equal(
      isCrjLanguagesValid(Array.from({ length: 11 }, (_, i) => `x${i}`)),
      false,
    );
    const patch = buildProfileContextSavePatch({
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
      languageCodes: ['en'],
    });
    assert.equal(profileContextSaveOmitsZodiac(patch), true);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'zodiacSign'), false);
  });
});

describe('profile context discovery parse', () => {
  const baseDetail = {
    mode: 'personal',
    displayName: 'Alex R.',
    profileImage: null,
    occupation: 'Designer',
    interestIds: ['sports_outdoors_soccer'],
    company: '',
    bio: 'Hello',
  };

  it('Detail parses context', () => {
    const detail = parseDiscoveryProfileDetail({
      ...baseDetail,
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
      languageCodes: ['es', 'en', 'pt'],
      zodiacSign: 'virgo',
    });
    assert.equal(detail.birthCountryCode, 'CO');
    assert.equal(detail.residenceCountryCode, 'US');
    assert.deepEqual(detail.languageCodes, ['es', 'en', 'pt']);
    assert.equal(detail.zodiacSign, 'virgo');
    assert.equal(zodiacSymbol('virgo'), '♍');
  });

  it('missing context safe defaults', () => {
    const detail = parseDiscoveryProfileDetail(baseDetail);
    assert.equal(detail.birthCountryCode, null);
    assert.equal(detail.residenceCountryCode, null);
    assert.deepEqual(detail.languageCodes, []);
    assert.equal(detail.zodiacSign, null);
  });

  it('Summary unchanged and rejects context keys', () => {
    assert.throws(() =>
      parseDiscoveryProfileSummary({
        mode: 'personal',
        displayName: 'Alex R.',
        profileImage: null,
        occupation: 'Designer',
        interestIds: [],
        birthCountryCode: 'CO',
      }),
    );
  });

  it('distance still parsed; DOB absent', () => {
    const response = parseGetDiscoveryProfileResponse({
      contractVersion: 1,
      uid: 'u1',
      distanceMeters: 42,
      profile: {
        ...baseDetail,
        birthCountryCode: 'CO',
        zodiacSign: 'aries',
      },
      gallery: [],
      socialLinks: [],
      affiliations: [],
      serverTime: 1,
    });
    assert.equal(response.distanceMeters, 42);
    assert.equal(response.profile.zodiacSign, 'aries');
    assert.equal(parseZodiacSign(null), null);
  });
});

describe('profile context edit save + sync', () => {
  it('save writes three fields and calls sync; synced:false does not rollback', async () => {
    const patch = buildProfileContextSavePatch({
      birthCountryCode: 'co',
      residenceCountryCode: 'us',
      languageCodes: ['en', 'es'],
    });
    assert.deepEqual(patch, {
      birthCountryCode: 'CO',
      residenceCountryCode: 'US',
      languageCodes: ['en', 'es'],
    });
    assert.ok(profileContextSaveOmitsZodiac(patch));

    const client = createFakeVisibilityDiscoveryClient({
      syncDiscoveryProfileContext: async () => ({
        contractVersion: CONTRACT_VERSION,
        synced: false,
        serverTime: 1,
      }),
    });
    const outcome = await syncDiscoveryProfileContextAfterSave(client);
    assert.equal(outcome.kind, 'not_synced');
    assert.ok(
      client.calls.some((c) => c.name === 'syncDiscoveryProfileContext'),
    );
  });

  it('reads user doc context safely', () => {
    assert.deepEqual(readProfileContextFromUserDoc(undefined), {
      birthCountryCode: null,
      residenceCountryCode: null,
      languageCodes: [],
    });
    assert.equal(hasAnyDiscoveryContext({ languageCodes: [] }), false);
    assert.equal(
      hasAnyDiscoveryContext({ birthCountryCode: 'CO', languageCodes: [] }),
      true,
    );
  });
});

describe('profile context alignment + discovery screen regressions', () => {
  it('preserves Alignment 0% and unavailable mapping', () => {
    const zero = toAlignment({
      available: true,
      score: 0,
      formulaVersion: '1',
    });
    assert.equal(zero?.available, true);
    if (zero?.available) assert.equal(zero.score, 0);
    assert.equal(
      mapUnavailableReasonToAlignmentState('embeddings-pending'),
      'processing',
    );
    assert.equal(
      mapUnavailableReasonToAlignmentState('embeddings-failed'),
      'unavailable',
    );
  });

  it('Discovery screen omits distance, uses context header, keeps all interests', () => {
    const screenSrc = readFileSync(
      join(__dirname, '../../screens/DiscoveryProfileScreen.tsx'),
      'utf8',
    );
    assert.doesNotMatch(screenSrc, /distanceLabel/);
    assert.doesNotMatch(screenSrc, /DiscoveryCompatibilityCard/);
    assert.match(screenSrc, /DiscoveryProfileIdentityHeader/);
    assert.match(screenSrc, /DiscoveryContextCard/);
    assert.match(screenSrc, /resolveInterestChips/);
    assert.doesNotMatch(screenSrc, /intersectOnboardingInterestIds/);
  });
});
