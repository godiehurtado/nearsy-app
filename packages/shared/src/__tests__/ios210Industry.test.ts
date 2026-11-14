/**
 * Nearsy iOS 2.1.0 — professional Industry (Owner-approved contract, Functions
 * b574639, docs/industries/INDUSTRY_CONTRACT.md).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import catalogJson from '../industries/industry-catalog.v1.json';
import {
  INDUSTRY_CATALOG_VERSION,
  getIndustries,
  getIndustry,
  getIndustrySectors,
  industryIonicon,
  industryLabel,
  industryLocale,
  industryPickerSections,
  industryShortLabel,
  normalizeIndustrySearch,
  searchIndustries,
  sectorIonicon,
} from '../industries/catalog';
import { parseIndustryRef } from '../industries/industryRef';
import {
  INDUSTRY_SECTOR_COLORS,
  INTEREST_ICON_PALETTE,
  industryIconColor,
} from '../industries/industryColors';
import {
  parseDiscoverNearbyResponse,
  parseDiscoveryProfileDetail,
  parseDiscoveryProfileSummary,
} from '../visibility/callables/parse';
import { mapDiscoverResultsToAlerts } from '../hooks/nearbyAlertsMapping';
import {
  buildAlertAffiliationDetail,
  buildAlertRowMessage,
} from '../screens/alertsPresentation';
import { parseEncounterNotifyPayload } from '../alerts/encounterNotifyPayload';
import {
  buildNotifyNearbyIndustryPatch,
  resolveNotifyNearbyIndustry,
} from '../alerts/notifyPrefs';
import { EVENT_RULES } from '../analytics/contract';
import { sanitizeProperties } from '../analytics/sanitize';
import {
  buildOwnProfileIndustrySavePatch,
  createOwnProfileDraftFromDoc,
  createOwnProfileSnapshot,
  isOwnProfileDraftDirty,
  readProfessionalIndustryId,
  type OwnProfileDraft,
} from '../profile/ownProfileEditorState';
import es from '../i18n/locales/es';
import en from '../i18n/locales/en';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');
const repoRoot = join(here, '..', '..', '..', '..');

const lookup = (root: unknown) =>
  ((key: string, opts?: Record<string, unknown>) => {
    let cur: any = root;
    for (const part of key.split('.')) cur = cur?.[part];
    assert.equal(typeof cur, 'string', `missing i18n key ${key}`);
    return (cur as string).replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(opts?.[k] ?? ''));
  }) as any;
const tEn = lookup(en);
const tEs = lookup(es);
const translateItem = ((id: string) => id) as any;

describe('bundled catalog: verbatim copy of the approved v1', () => {
  it('is version 1, approved, 20 groups and 108 industries', () => {
    const c = catalogJson as any;
    assert.equal(c.catalog, 'nearsy-industries');
    assert.equal(c.version, 1);
    assert.equal(INDUSTRY_CATALOG_VERSION, 1);
    assert.equal(c.status, 'approved');
    assert.equal(getIndustrySectors().length, 20);
    assert.equal(getIndustries().length, 108);
  });

  it('content matches the Functions copy at b574639 (hash of the parsed JSON)', () => {
    const hash = createHash('sha256').update(JSON.stringify(catalogJson)).digest('hex');
    assert.equal(hash, '046334f7ff1a2850cc87b4a6f6848063dfdf12e830f77b30f79367445e36295d');
  });

  it('ids are unique, match the pattern and never collide with sectors or "industry"', () => {
    const ids = getIndustries().map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]{1,40}$/);
    const sectors = new Set(getIndustrySectors().map((s) => s.id));
    for (const id of ids) assert.equal(sectors.has(id), false, id);
    assert.equal(ids.includes('industry'), false);
  });

  it('labels ≤ 40 and short labels ≤ 32 in EN and ES', () => {
    for (const item of getIndustries()) {
      for (const l of ['en', 'es'] as const) {
        assert.ok(item.label[l].length > 0 && item.label[l].length <= 40, item.id);
        assert.ok(item.shortLabel[l].length > 0 && item.shortLabel[l].length <= 32, item.id);
      }
    }
  });

  it('every Ionicons name exists in the installed glyph map (iOS)', () => {
    const iosRequire = createRequire(join(repoRoot, 'apps', 'nearsy-ios', 'package.json'));
    const glyphs = JSON.parse(
      readFileSync(
        iosRequire.resolve(
          '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
        ),
        'utf8',
      ),
    );
    for (const icon of (catalogJson as any).iconKeys) {
      assert.ok(glyphs[icon.ionicons] !== undefined, `${icon.key} → ${icon.ionicons}`);
    }
    for (const item of getIndustries()) assert.ok(glyphs[industryIonicon(item.id)] !== undefined);
    for (const sector of getIndustrySectors()) assert.ok(glyphs[sectorIonicon(sector.id)] !== undefined);
    // Owner: sector icon instead of misleading approximations.
    assert.equal(industryIonicon('dental'), 'medical-outline');
    assert.equal(industryIonicon('unknown_id'), 'business-outline');
  });
});

describe('labels by locale and fallbacks', () => {
  it('renders the bundled label; short label for push and inbox', () => {
    assert.equal(industryLabel('animal_production', 'es'), 'Ganadería y producción animal');
    assert.equal(industryShortLabel('animal_production', 'es'), 'Ganadería');
    assert.equal(industryShortLabel('animal_production', 'en'), 'Livestock');
  });

  it('an id this build does not know shows the Discovery name (English)', () => {
    assert.equal(industryLabel('future_industry', 'es', 'Future Industry'), 'Future Industry');
    assert.equal(industryShortLabel('future_industry', 'es', '  Future   Industry '), 'Future Industry');
    assert.equal(industryLabel('future_industry', 'es'), null);
    assert.equal(industryLabel(null, 'es'), null);
  });

  it('locale is es only for Spanish UI languages', () => {
    assert.equal(industryLocale('es'), 'es');
    assert.equal(industryLocale('es-MX'), 'es');
    assert.equal(industryLocale('en'), 'en');
    assert.equal(industryLocale(undefined), 'en');
  });
});

describe('picker: sectors, order, search', () => {
  it('lists 20 sector headers with every active item once, in order', () => {
    const sections = industryPickerSections('es');
    assert.equal(sections.length, 20);
    const ids = sections.flatMap((s) => s.items.map((i) => i.id));
    assert.equal(ids.length, 108);
    assert.equal(new Set(ids).size, 108);
    for (let i = 1; i < sections.length; i += 1) {
      assert.ok(sections[i - 1].sector.order < sections[i].sector.order);
    }
    for (const s of sections) {
      for (let i = 1; i < s.items.length; i += 1) assert.ok(s.items[i - 1].order < s.items[i].order);
    }
  });

  it('ignores case and accents in both languages', () => {
    assert.equal(normalizeIndustrySearch('  Odontología '), 'odontologia');
    assert.equal(searchIndustries('ODONTOLOGIA', 'es')[0].id, 'dental');
    assert.equal(searchIndustries('dentista', 'es')[0].id, 'dental');
    assert.equal(searchIndustries('dentist', 'en')[0].id, 'dental');
  });

  it('ranks a label prefix before an exact synonym and a substring', () => {
    const results = searchIndustries('software', 'en').map((i) => i.id);
    assert.equal(results[0], 'software');
    const tech = searchIndustries('tecnologia', 'es').map((i) => i.id);
    assert.ok(tech.includes('software'));
  });

  it('empty query returns nothing; there is no free-text option', () => {
    assert.deepEqual(searchIndustries('   ', 'en'), []);
    assert.deepEqual(searchIndustries('zzzz no match', 'es'), []);
  });
});

describe('Discovery { id, name } (contract §4)', () => {
  it('accepts exactly a catalog-shaped id and a name', () => {
    assert.deepEqual(parseIndustryRef({ id: 'dental', name: 'Dental Care' }), {
      id: 'dental',
      name: 'Dental Care',
    });
    for (const bad of [null, 'dental', { id: 'Dental', name: 'x' }, { id: 'dental' }, { id: 'dental', name: '' }, { id: 'dental', name: { en: 'x' } }, []]) {
      assert.equal(parseIndustryRef(bad), undefined);
    }
  });

  const summary = (extra: Record<string, unknown>) => ({
    mode: 'professional',
    displayName: 'Ana',
    profileImage: null,
    occupation: 'Dentist',
    interestIds: [],
    ...extra,
  });

  it('summary: professional profile.industry parsed; personal ignored; malformed never throws', () => {
    assert.deepEqual(parseDiscoveryProfileSummary(summary({ industry: { id: 'dental', name: 'Dental Care' } })).industry, {
      id: 'dental',
      name: 'Dental Care',
    });
    assert.equal(
      parseDiscoveryProfileSummary(summary({ mode: 'personal', industry: { id: 'dental', name: 'Dental Care' } })).industry,
      undefined,
    );
    assert.equal(parseDiscoveryProfileSummary(summary({ industry: 'dental' })).industry, undefined);
    assert.equal(parseDiscoveryProfileSummary(summary({})).industry, undefined);
  });

  it('detail carries profile.industry through the summary fields', () => {
    const detail = parseDiscoveryProfileDetail({
      ...summary({ industry: { id: 'legal_services', name: 'Legal Services' } }),
      company: 'Firm',
      bio: '',
    });
    assert.equal(detail.industry?.id, 'legal_services');
  });

  it('discoverNearby: sharedIndustry only next to a professional profile', () => {
    const response = parseDiscoverNearbyResponse({
      contractVersion: 1,
      nextCursor: null,
      serverTime: 1,
      results: [
        { uid: 'a', distanceMeters: 10, profile: summary({}), sharedIndustry: { id: 'dental', name: 'Dental Care' } },
        { uid: 'b', distanceMeters: 10, profile: summary({ mode: 'personal' }), sharedIndustry: { id: 'dental', name: 'Dental Care' } },
        { uid: 'c', distanceMeters: 10, profile: summary({}), sharedIndustry: { id: 'BAD', name: 'x' } },
      ],
    });
    assert.deepEqual(response.results.map((r) => r.sharedIndustry?.id), ['dental', undefined, undefined]);
  });
});

describe('Alerts inbox: Industry has priority (Product)', () => {
  const result = (uid: string, extra: Record<string, unknown>) => ({
    uid,
    distanceMeters: 30,
    profile: {
      mode: 'professional',
      displayName: `Name ${uid}`,
      profileImage: null,
      occupation: 'x',
      interestIds: ['sports_outdoors_soccer'],
    },
    ...extra,
  });
  const inbox = (results: unknown[]) =>
    mapDiscoverResultsToAlerts(
      parseDiscoverNearbyResponse({ contractVersion: 1, results, nextCursor: null, serverTime: 1 }).results,
      new Set(['sports_outdoors_soccer']),
      1000,
      'viewer',
      (m) => m * 3.28084,
    );

  it('industry beats affiliation and interests; one row per person', () => {
    const rows = inbox([
      result('p', {
        sharedIndustry: { id: 'animal_production', name: 'Livestock and Animal Production' },
        sharedAffiliationCount: 2,
        sharedAffiliationNames: ['Club A', 'Club B'],
      }),
    ]);
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.kind, 'industry_nearby');
    assert.equal(
      buildAlertRowMessage(row, tEs, translateItem, 'es'),
      'Name p está cerca y comparten industria: Ganadería.',
    );
    assert.equal(
      buildAlertRowMessage(row, tEn, translateItem, 'en'),
      'Name p is nearby. You both work in Livestock.',
    );
    assert.equal(buildAlertAffiliationDetail(row, tEs), null, 'one motive per row');
  });

  it('sharedIndustry alone qualifies a row', () => {
    const rows = inbox([
      {
        ...result('q', { sharedIndustry: { id: 'dental', name: 'Dental Care' } }),
        profile: { mode: 'professional', displayName: 'Name q', profileImage: null, occupation: 'x', interestIds: [] },
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'industry_nearby');
  });

  it('an unknown id uses the server name; without industry the old priority stays', () => {
    const [unknown] = inbox([result('u', { sharedIndustry: { id: 'future_x', name: 'Future X' } })]);
    assert.equal(buildAlertRowMessage(unknown, tEs, translateItem, 'es'), 'Name u está cerca y comparten industria: Future X.');
    const [affiliation] = inbox([result('a', { sharedAffiliationCount: 1 })]);
    assert.equal(affiliation.kind, 'affiliation_nearby');
    const [interest] = inbox([result('i', {})]);
    assert.equal(interest.kind, 'interest_nearby');
  });

  it('ES copy is the approved one, in the "comparten" register', () => {
    assert.equal(tEs('notifications.messages.industryNearby', { name: 'N', industry: 'X' }), 'N está cerca y comparten industria: X.');
    assert.equal(tEn('notifications.messages.industryNearby', { name: 'N', industry: 'X' }), 'N is nearby. You both work in X.');
  });
});

describe('push motive and analytics', () => {
  const push = (data: Record<string, unknown>) =>
    parseEncounterNotifyPayload({ kind: 'contact_nearby', actorUid: 'u1', ...data });

  it('industry is a known motive; fromContacts comes from the payload', () => {
    assert.deepEqual(push({ motive: 'industry', fromContacts: true }), {
      kind: 'contact_nearby',
      actorUid: 'u1',
      fromContacts: true,
      motive: 'industry',
    });
    assert.equal(push({ motive: 'industry', fromContacts: false })?.fromContacts, false);
    assert.equal(push({ motive: 'something_new' })?.motive, undefined);
  });

  it('alert_opened accepts alert_motive industry', () => {
    const rules = (EVENT_RULES as any).alert_opened;
    const clean = sanitizeProperties(rules, { source: 'push', alert_motive: 'industry' });
    assert.deepEqual(clean.droppedNames, []);
  });
});

describe('notifyNearbyIndustry (contract §2)', () => {
  it('absent means on; only explicit false turns it off', () => {
    assert.equal(resolveNotifyNearbyIndustry(undefined), true);
    assert.equal(resolveNotifyNearbyIndustry(null), true);
    assert.equal(resolveNotifyNearbyIndustry(true), true);
    assert.equal(resolveNotifyNearbyIndustry(false), false);
    assert.deepEqual(buildNotifyNearbyIndustryPatch(false), { notifyNearbyIndustry: false });
  });

  it('More writes it only from the toggle, then reevaluates', () => {
    const more = read('screens/MoreScreen.tsx');
    const handler = more.slice(
      more.indexOf('const handleToggleNotifyNearbyIndustry'),
      more.indexOf('const handleToggleNotifyNearbyContacts'),
    );
    assert.match(handler, /buildNotifyNearbyIndustryPatch\(enabled\)/);
    assert.match(handler, /scheduleReevaluateProximityNotices\(\)/);
    assert.match(more, /resolveNotifyNearbyIndustry\(data\.notifyNearbyIndustry\)/);
    // Never written at sign-up.
    assert.doesNotMatch(read('screens/ProfileCompletionScreen.tsx'), /notifyNearbyIndustry/);
  });
});

describe('own profile draft: professionalIndustryId', () => {
  const base: OwnProfileDraft = {
    realName: 'Ana',
    lastName: 'Cruz',
    profileImage: 'https://x/y.jpg',
    occupation: 'Dentist',
    bio: '',
    company: 'Clinic',
    birthCountryCode: null,
    currentCity: null,
    languageCodes: [],
    professionalIndustryId: 'dental',
  };

  it('reads the top-level field; absent or malformed is null', () => {
    assert.equal(readProfessionalIndustryId({ professionalIndustryId: 'dental' }), 'dental');
    assert.equal(readProfessionalIndustryId({}), null);
    assert.equal(readProfessionalIndustryId({ professionalIndustryId: 'Dental!' }), null);
    const draft = createOwnProfileDraftFromDoc({ professionalIndustryId: 'dental' }, { realName: 'Ana' } as any);
    assert.equal(draft.professionalIndustryId, 'dental');
  });

  it('dirty and saved only in professional mode, and only when changed', () => {
    const snapshot = createOwnProfileSnapshot(base);
    const changed = { ...base, professionalIndustryId: 'legal_services' };
    assert.equal(isOwnProfileDraftDirty(changed, snapshot, 'professional'), true);
    assert.equal(isOwnProfileDraftDirty(changed, snapshot, 'personal'), false);
    assert.deepEqual(buildOwnProfileIndustrySavePatch(changed, snapshot, 'professional'), {
      professionalIndustryId: 'legal_services',
    });
    assert.deepEqual(buildOwnProfileIndustrySavePatch(changed, snapshot, 'personal'), {});
    assert.deepEqual(buildOwnProfileIndustrySavePatch(base, snapshot, 'professional'), {});
  });

  it('"Not specified" writes null (never deleteField)', () => {
    const snapshot = createOwnProfileSnapshot(base);
    assert.deepEqual(
      buildOwnProfileIndustrySavePatch({ ...base, professionalIndustryId: null }, snapshot, 'professional'),
      { professionalIndustryId: null },
    );
  });
});

describe('screen wiring', () => {
  it('CRJ details: field only in professional mode; writes when changed, then reevaluates', () => {
    const crj = read('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /mode === 'professional' \? \(\s*<IndustrySearchField/);
    assert.match(crj, /professionalIndustryId: professionalIndustryId \?\? null/);
    const persist = crj.slice(crj.indexOf('async function persistDetails'), crj.indexOf('async function persistInterests'));
    assert.match(persist, /mode === 'professional' && professionalIndustryId !== persistedIndustryIdRef\.current/);
    assert.match(persist, /scheduleReevaluateProximityNotices\(\)/);
  });

  it('edit screen: professional field, save patch and reevaluation', () => {
    const edit = read('screens/CompleteProfileScreen.tsx');
    // QA 2.1.0: Industry is a field of the details card (after Company, before
    // Biography), not a block outside it.
    assert.match(edit, /professionalExtraField=\{\s*<IndustrySearchField/);
    assert.doesNotMatch(edit, /styles\.industryField/);
    const details = read('components/profile/OwnProfileDetails.tsx');
    const company = details.indexOf('label={labels.company}');
    const extra = details.indexOf("mode === 'professional' ? professionalExtraField");
    const biography = details.indexOf('label={labels.biography}');
    assert.ok(company > 0 && company < extra && extra < biography, 'Company → Industry → Biography');
    assert.match(edit, /buildOwnProfileIndustrySavePatch\(/);
    assert.match(edit, /patches: \[modePatch, contextPatch, industryPatch\]/);
    assert.match(edit, /Object\.keys\(industryPatch\)\.length > 0/);
  });

  it('picker: local icons, check mark, "Not specified", no remote logos or free text', () => {
    const field = read('components/profile/IndustrySearchField.tsx');
    assert.match(field, /industryIonicon\(/);
    assert.match(field, /name="checkmark"/);
    assert.match(field, /select\(null\)/);
    assert.match(field, /searchIndustries\(query, locale\)/);
    assert.doesNotMatch(field, /logo\.dev|img\.logo|Image/i);
    assert.equal(tEs('profile.industry.notSpecified'), 'Sin especificar');
    assert.equal(tEn('profile.industry.notSpecified'), 'Not specified');
  });

  it('Discovery profile shows Industry only for the professional face', () => {
    const screen = read('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /mode === 'professional' && profile\.industry/);
    assert.match(screen, /industryLabel\(profile\.industry\.id, industryLocale\(i18n\.language\), profile\.industry\.name\)/);
    assert.equal(tEs('discoveryProfile.industry'), 'Industria');
  });

  it('Alerts passes the UI locale for the short label', () => {
    assert.match(read('screens/AlertsScreen.tsx'), /buildAlertRowMessage\(item, t, translateItem, locale\)/);
  });
});

describe('picker icon colors (QA 2.1.0)', () => {
  it('every v1 sector has one color from the Interests palette; neighbours differ', () => {
    const sectors = [...(catalogJson as any).sectors].sort((a: any, b: any) => a.order - b.order);
    assert.deepEqual(Object.keys(INDUSTRY_SECTOR_COLORS).sort(), sectors.map((s: any) => s.id).sort());
    for (const s of sectors) assert.ok((INTEREST_ICON_PALETTE as readonly string[]).includes(INDUSTRY_SECTOR_COLORS[s.id]!), s.id);
    for (let i = 1; i < sectors.length; i++) {
      assert.notEqual(INDUSTRY_SECTOR_COLORS[sectors[i].id], INDUSTRY_SECTOR_COLORS[sectors[i - 1].id], sectors[i].id);
    }
  });

  it('the palette is the Interests one, verbatim', () => {
    const interests = read('interests/customInterestIconCatalog.ts');
    const block = interests.slice(interests.indexOf('const PALETTE = ['), interests.indexOf('] as const;', interests.indexOf('const PALETTE = [')));
    assert.deepEqual(block.match(/#[0-9A-F]{6}/g), [...INTEREST_ICON_PALETTE]);
  });

  it('items take their sector color; unknown or null ids keep the fallback', () => {
    const item = (catalogJson as any).industries.find((i: any) => i.status === 'active');
    assert.equal(industryIconColor(item.id, 'x'), INDUSTRY_SECTOR_COLORS[item.sector]);
    assert.equal(industryIconColor(null, 'x'), 'x');
    assert.equal(industryIconColor('not_an_industry', 'x'), 'x');
    const field = read('components/profile/IndustrySearchField.tsx');
    assert.equal(field.split('industryIconColor(').length - 1, 2);
  });
});
