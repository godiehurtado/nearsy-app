/**
 * Industry 2.1.0 (Functions INDUSTRY_CONTRACT.md at 5c1e115, catalog v1 at b574639
 * approved). Real modules, synthetic responses.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Extensionless relative imports resolve only under Metro.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      for (const ext of ['.ts', '.tsx']) {
        const candidate = new URL(`${specifier}${ext}`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return next(`${specifier}${ext}`, context);
      }
    }
    return next(specifier, context);
  },
});

const catalog = await import('../industries/industryCatalog.ts');
const { INDUSTRY_CATALOG_DATA } = await import('../industries/industryCatalogData.ts');
const writes = await import('../industries/industryProfileWrite.ts');
const { parseDiscoverNearbyResponse, parseGetDiscoveryProfileResponse } = await import(
  '../visibility/callables/parse.ts'
);
const { parseEncounterNotifyPayload } = await import('../alerts/encounterNotifyPayload.ts');
const { mapDiscoverResultsToInterestAlerts } = await import('../hooks/nearbyAlertsMapping.ts');
const { buildAlertRowMessage } = await import('../screens/alertsPresentation.ts');
const { buildPersonProperties, personKeysToUnset, MODE_SCOPED_PERSON_PROPERTIES } = await import(
  '../analytics/analyticsPersonProperties.ts'
);
const { default: notificationsEn } = await import('../i18n/resources/notifications.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '../../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('bundled catalog', () => {
  it('is version 1 approved: 20 groups, 108 industries, stable id shape, contract limits', () => {
    assert.equal(INDUSTRY_CATALOG_DATA.version, 1);
    assert.equal(INDUSTRY_CATALOG_DATA.status, 'approved');
    assert.equal(INDUSTRY_CATALOG_DATA.sectors.length, 20);
    assert.equal(INDUSTRY_CATALOG_DATA.industries.length, 108);
    const ids = new Set<string>();
    for (const item of INDUSTRY_CATALOG_DATA.industries) {
      assert.match(item.id, catalog.INDUSTRY_ID_PATTERN);
      assert.ok(!ids.has(item.id), item.id);
      ids.add(item.id);
      for (const lang of ['en', 'es'] as const) {
        assert.ok(item.label[lang].length <= 40, item.id);
        assert.ok(item.shortLabel[lang].length <= 32, item.id);
      }
    }
  });

  it('every icon resolves to a MaterialCommunityIcons glyph of the installed build', () => {
    const requireFromApp = createRequire(path.join(repoRoot, 'apps/nearsy-android/package.json'));
    const glyphs = requireFromApp(
      '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
    );
    for (const icon of INDUSTRY_CATALOG_DATA.iconKeys) assert.ok(icon.material in glyphs, icon.key);
    for (const item of INDUSTRY_CATALOG_DATA.industries) {
      assert.ok(catalog.industryIconFor(item.id) in glyphs, item.id);
    }
    assert.equal(catalog.industryMaterialIcon('no_such_key'), catalog.industryMaterialIcon('generic'));
  });

  it('matches the Functions file at the pinned SHA when that repo is on this machine', (t) => {
    const functions = 'C:/Users/Godie/source/repos/NEARSY/functions';
    if (!existsSync(functions)) return t.skip('Functions repo not present');
    const raw = execFileSync(
      'git',
      ['-C', functions, 'show', 'b574639e3fac68f87fafb816b2455b1dddf9ba85:docs/industries/industry-catalog.v1.json'],
      { encoding: 'utf8' },
    );
    assert.deepEqual(INDUSTRY_CATALOG_DATA, JSON.parse(raw));
  });
});

describe('picker and search', () => {
  it('groups in catalog order, active items only', () => {
    const sections = catalog.industryPickerSections();
    assert.equal(sections.reduce((n, s) => n + s.items.length, 0), 108);
    const orders = sections.map((s) => s.sector.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it('searches EN/ES labels and synonyms without case or accents; label prefix first', () => {
    const ids = (q: string) => catalog.searchIndustries(q).map((i) => i.id);
    assert.deepEqual(ids(''), []);
    assert.ok(ids('software').length > 0);
    assert.equal(ids('Software')[0], ids('software')[0]);
    const first = catalog.searchIndustries('agri')[0];
    assert.ok(normalize(first.label.en).startsWith('agri') || normalize(first.label.es).startsWith('agri'));
    assert.deepEqual(ids('clinica'), ids('clínica'));
    assert.ok(ids('inteligencia artificial').length > 0);
    assert.ok(ids('marketing').includes('advertising_marketing'));
    assert.deepEqual(ids('zzzz-nothing'), []);
  });

  it('labels by language, falling back to the Discovery name for an id this bundle lacks', () => {
    const any = INDUSTRY_CATALOG_DATA.industries[0];
    assert.equal(catalog.industryLabel(any.id, 'es'), any.label.es);
    assert.equal(catalog.industryShortLabel(any.id, 'en'), any.shortLabel.en);
    assert.equal(catalog.industryLabel('future_industry', 'es', 'Future Industry'), 'Future Industry');
    assert.equal(catalog.industryLabel('future_industry', 'es'), null);
    assert.equal(catalog.industryLang('es-CO'), 'es');
    assert.equal(catalog.industryLang('en-US'), 'en');
  });
});

const normalize = (text: string) => catalog.normalizeIndustrySearch(text);

describe('stored values', () => {
  it('"Not specified" is null; absent and malformed read as null', () => {
    assert.equal(catalog.readIndustryId(undefined), null);
    assert.equal(catalog.readIndustryId(null), null);
    assert.equal(catalog.readIndustryId(''), null);
    assert.equal(catalog.readIndustryId('Software'), null);
    assert.equal(catalog.readIndustryId('software'), 'software');
  });

  it('writes the id or explicit null, never deleteField; only offered ids', () => {
    assert.deepEqual(writes.buildProfessionalIndustryPatch(null), { professionalIndustryId: null });
    assert.deepEqual(writes.buildProfessionalIndustryPatch('software'), { professionalIndustryId: 'software' });
    assert.throws(() => writes.buildProfessionalIndustryPatch('not_in_catalog'));
    for (const file of ['industries/industryProfileWrite.ts', 'industries/saveProfessionalIndustry.ts']) {
      assert.doesNotMatch(read(file), /deleteField\(|firestoreDeleteField/);
    }
    assert.match(read('industries/saveProfessionalIndustry.ts'), /scheduleReevaluateProximityNotices\(\)/);
  });

  it('notifyNearbyIndustry: absent is on, only false turns it off, never written at signup', () => {
    assert.equal(writes.resolveNotifyNearbyIndustry(undefined), true);
    assert.equal(writes.resolveNotifyNearbyIndustry(true), true);
    assert.equal(writes.resolveNotifyNearbyIndustry(false), false);
    assert.deepEqual(writes.buildNotifyNearbyIndustryPatch(false), { notifyNearbyIndustry: false });
    assert.doesNotMatch(read('screens/ProfileCompletionScreen.tsx'), /notifyNearbyIndustry/);
  });

  it('CRJ writes the industry only in professional mode, when the person picked it', () => {
    const crj = read('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /mode === 'professional' && industryTouchedRef\.current/);
    assert.match(crj, /'professionalIndustryId' in industryPatch\) scheduleReevaluateProximityNotices\(\)/);
    const editor = read('screens/CompleteProfileScreen.tsx');
    // Own Profile: Industry is a professional-only slot inside the details card.
    assert.match(editor, /professionalField=\{\s*<IndustrySelectField/);
  });

  it('Own Profile shows Industry under Company and before Biography, in the same card', () => {
    const details = read('components/profile/OwnProfileDetails.tsx');
    const company = details.indexOf('label={labels.company}');
    const slot = details.indexOf('{professionalField ?? null}');
    const biography = details.indexOf('label={labels.biography}');
    const background = details.indexOf('<OwnProfileBackgroundCard');
    assert.ok(company > 0 && slot > company && biography > slot && background > biography);
    // The field label and box follow FormInput (uppercase label, same radius and border).
    const field = read('components/industry/IndustrySelectField.tsx');
    assert.match(field, /textTransform: 'uppercase'/);
    assert.match(field, /borderRadius: radius\.lg/);
    assert.match(field, /borderColor: palette\.borderStrong/);
  });

  it('the picker has no free text or remote logos', () => {
    const picker = read('components/industry/IndustryPickerModal.tsx');
    // Comments may name Logo.dev; the code reaches no remote image or URL.
    assert.doesNotMatch(picker, /https?:\/\/|fetch\(|AffiliationLogoMark|<Image\b/);
    // The search text is never submitted as a value.
    assert.doesNotMatch(picker, /onSubmitEditing|onSelect\(query/);
    assert.match(picker, /searchIndustries\(/);
    assert.match(picker, /profile\.industry\.unspecified/);
  });
});

const peer = (extra: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) => ({
  uid: 'peer1',
  distanceMeters: 5,
  profile: {
    mode: 'professional',
    displayName: 'Ana',
    profileImage: null,
    occupation: '',
    interestIds: [],
    ...profile,
  },
  ...extra,
});
const nearby = (rows: unknown[]) =>
  parseDiscoverNearbyResponse({ contractVersion: 1, results: rows, nextCursor: null, serverTime: 1000 });

describe('Discovery', () => {
  it('reads profile.industry and sharedIndustry as exactly { id, name }', () => {
    const ref = { id: 'software', name: 'Software and Cloud' };
    const [result] = nearby([peer({ sharedIndustry: ref }, { industry: ref })]).results;
    assert.deepEqual(result.profile.industry, ref);
    assert.deepEqual(result.sharedIndustry, ref);
  });

  it('drops anything else without failing the response', () => {
    for (const bad of [null, 'software', { id: 'Software', name: 'x' }, { id: 'software' }, { id: 'software', name: { en: 'x', es: 'y' } }, { id: 'software', name: '  ' }]) {
      const [result] = nearby([peer({ sharedIndustry: bad }, { industry: bad })]).results;
      assert.ok(!('industry' in result.profile));
      assert.ok(!('sharedIndustry' in result));
    }
  });

  it('the profile detail carries the industry too', () => {
    const response = parseGetDiscoveryProfileResponse({
      contractVersion: 1,
      uid: 'peer1',
      distanceMeters: 5,
      profile: { ...peer().profile, company: 'Acme', bio: '', industry: { id: 'software', name: 'Software' } },
      gallery: [],
      serverTime: 1000,
    });
    assert.deepEqual(response.profile.industry, { id: 'software', name: 'Software' });
  });
});

describe('push', () => {
  it('motive industry is known; fromContacts still comes from the payload', () => {
    const base = { kind: 'contact_nearby', actorUid: 'peer1', motive: 'industry' };
    assert.equal(parseEncounterNotifyPayload(base)?.motive, 'industry');
    assert.equal(parseEncounterNotifyPayload(base)?.fromContacts, false);
    assert.equal(parseEncounterNotifyPayload({ ...base, fromContacts: true })?.fromContacts, true);
  });
});

describe('Alerts inbox', () => {
  const t = (key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ''}`;
  const item = (_k: string, fallback: string) => fallback;
  const alerts = (extra: Record<string, unknown>, interestIds: string[] = []) =>
    mapDiscoverResultsToInterestAlerts(nearby([peer(extra, { interestIds })]).results, new Set(['music']), 1000, 'me');

  it('an industry match alone makes a row; industry beats affiliation and interests', () => {
    const [onlyIndustry] = alerts({ sharedIndustry: { id: 'software', name: 'Software' } });
    assert.ok(onlyIndustry);
    const [all] = alerts(
      { sharedIndustry: { id: 'software', name: 'Software' }, sharedAffiliationCount: 2 },
      ['music'],
    );
    const es = INDUSTRY_CATALOG_DATA.industries.find((i) => i.id === 'software')!.shortLabel.es;
    assert.equal(
      buildAlertRowMessage(all, t, item, 'es'),
      `notifications.messages.industryNearby{"name":"Ana","industry":"${es}"}`,
    );
  });

  it('an id the bundle lacks shows the English name sent by Functions', () => {
    const [row] = alerts({ sharedIndustry: { id: 'future_industry', name: 'Future Industry' } });
    assert.equal(
      buildAlertRowMessage(row, t, item, 'es'),
      'notifications.messages.industryNearby{"name":"Ana","industry":"Future Industry"}',
    );
  });

  it('copy matches the contract in EN and ES', () => {
    assert.equal(notificationsEn.messages.industryNearby, '{{name}} is nearby. You both work in {{industry}}.');
    assert.match(read('i18n/locales/es.ts'), /industryNearby: '\{\{name\}\} está cerca y comparten industria: \{\{industry\}\}\.'/);
  });
});

describe('PostHog industry', () => {
  const person = (doc: Record<string, unknown>) =>
    buildPersonProperties({ doc, authEmail: null, normalizeLanguages: (v) => v as string[] })!;

  it('is the professional id, kept when the person is in Personal', () => {
    assert.equal(person({ mode: 'professional', professionalIndustryId: 'software' }).industry, 'software');
    const personal = { mode: 'personal', professionalIndustryId: 'software' };
    assert.equal(person(personal).industry, 'software');
    assert.ok(!MODE_SCOPED_PERSON_PROPERTIES.includes('industry'));
    assert.ok(!personKeysToUnset({ doc: personal, properties: person(personal), previousMode: 'professional' }).includes('industry'));
  });

  it('$unset only on an explicit "Not specified"; absent leaves it alone', () => {
    const cleared = { mode: 'professional', professionalIndustryId: null };
    assert.ok(!('industry' in person(cleared)));
    assert.ok(personKeysToUnset({ doc: cleared, properties: person(cleared), previousMode: 'professional' }).includes('industry'));
    const never = { mode: 'professional' };
    assert.ok(!personKeysToUnset({ doc: never, properties: person(never), previousMode: 'professional' }).includes('industry'));
  });
});

describe('industry icon colors (agreed with iOS)', async () => {
  const colors = await import('../industries/industryColors.ts');
  const palette = read('interests/customInterestIconCatalog.ts');

  it('every catalog v1 sector has a color from the Interests palette', () => {
    const sectors = [...INDUSTRY_CATALOG_DATA.sectors].sort((a, b) => a.order - b.order);
    assert.deepEqual(
      Object.keys(colors.INDUSTRY_SECTOR_COLORS).sort(),
      sectors.map((s) => s.id).sort(),
    );
    for (const s of sectors) {
      const hex = colors.INDUSTRY_SECTOR_COLORS[s.id]!;
      assert.match(hex, /^#[0-9A-F]{6}$/);
      assert.ok(palette.includes(`'${hex}'`), `${s.id} ${hex} is not in the Interests palette`);
    }
    for (let i = 1; i < sectors.length; i += 1) {
      assert.notEqual(
        colors.INDUSTRY_SECTOR_COLORS[sectors[i]!.id],
        colors.INDUSTRY_SECTOR_COLORS[sectors[i - 1]!.id],
        `${sectors[i - 1]!.id} and ${sectors[i]!.id} share a color`,
      );
    }
  });

  it('items take their sector color; none and unknown keep the fallback', () => {
    const item = INDUSTRY_CATALOG_DATA.industries.find((i) => i.status === 'active')!;
    assert.equal(colors.industryIconColor(item.id, 'muted'), colors.INDUSTRY_SECTOR_COLORS[item.sector]);
    assert.equal(colors.industryIconColor(null, 'muted'), 'muted');
    assert.equal(colors.industryIconColor('not_a_real_industry', 'muted'), 'muted');
    assert.equal(colors.industrySectorColor('__proto__'), null);
  });

  it('the picker rows and the field use the sector colors', () => {
    assert.match(read('components/industry/IndustryPickerModal.tsx'), /color=\{industrySectorColor\(row\.item\.sector\) \?\? palette\.textSecondary\}/);
    assert.match(read('components/industry/IndustrySelectField.tsx'), /industryIconColor\(value, palette\.textSecondary\)/);
  });
});
