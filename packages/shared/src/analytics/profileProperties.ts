/**
 * Builds PostHog person properties from users/{uid}, always for the active mode.
 *
 * Three states for what the active mode holds:
 * - Known, including confirmed empty: the value is sent ([] for an empty bag).
 * - Unknown in a profile that was read (absent bag, legacy profile): the property
 *   is unset, because whatever PostHog holds may belong to the other mode.
 * - Read failed: nothing runs, so valid data is never erased by an error.
 *
 * Pure module.
 */
import {
  AGE_RANGES,
  OCCUPATION_MAX_LENGTH,
  PERSON_NAME_MAX_LENGTH,
  PROFILE_ID_ITEM_MAX_LENGTH,
  PROFILE_LIST_MAX_ITEMS,
  PROFILE_TEXT_ITEM_MAX_LENGTH,
  type AgeRange,
  type AnalyticsSocialPlatform,
} from './contract';
import { isProfileMode, type ProfileMode } from '../profile/profileModeFields';
import { normalizeCountryCode } from '../profile/countryCatalog';
import { parseCurrentCity } from '../profile/currentCity';
import {
  normalizeSocialLinkUrl,
  type SocialLinkUrlPlatform,
} from '../social/socialLinkUrl';

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._+-]*$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Comparison form only: trim, collapse spaces, one case. Synonyms stay apart. */
export function normalizeForComparison(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type SelectionSummary = {
  catalog: string[];
  custom: string[];
  catalogCount: number;
  customCount: number;
  total: number;
};

function summarize(
  catalogRaw: readonly string[],
  customRaw: readonly string[],
): SelectionSummary {
  const catalog = [...new Set(catalogRaw)];
  const custom = [...new Set(customRaw)];
  return {
    catalog,
    custom,
    catalogCount: catalog.length,
    customCount: custom.length,
    total: catalog.length + custom.length,
  };
}

type InterestRow = { id?: unknown; name?: unknown; isCustom?: unknown };

/** Mirrors the placeholder rows the interest persistence patch leaves out. */
export function summarizeInterests(
  rows: readonly InterestRow[],
): SelectionSummary {
  const catalog: string[] = [];
  const custom: string[] = [];
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    const isCustom = row.isCustom === true || id.startsWith('custom_');
    if (isCustom) {
      // Custom ids embed the text, so only the original name is reported.
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (name) custom.push(name);
      continue;
    }
    if (!id || id.endsWith('_other') || id.includes('_group_')) continue;
    if (SAFE_ID_RE.test(id)) catalog.push(id);
  }
  return summarize(catalog, custom);
}

type AffiliationRow = {
  name?: unknown;
  source?: unknown;
  providerId?: unknown;
  categoryId?: unknown;
  topic?: unknown;
};

export function summarizeAffiliations(
  rows: readonly AffiliationRow[],
): SelectionSummary {
  const catalog: string[] = [];
  const custom: string[] = [];
  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const providerId =
      typeof row.providerId === 'string' ? row.providerId.trim() : '';
    if (row.source === 'provider' && providerId) {
      const stable = `provider:${providerId}`;
      if (SAFE_ID_RE.test(stable)) {
        catalog.push(stable);
        continue;
      }
    }
    if (name) {
      custom.push(name);
      continue;
    }
    // A nameless row is only a catalog topic, which is stable by definition.
    const topic = typeof row.topic === 'string' ? row.topic.trim() : '';
    const categoryId =
      typeof row.categoryId === 'string' ? row.categoryId.trim() : '';
    const stableTopic = `topic:${categoryId}:${topic}`;
    if (topic && categoryId && SAFE_ID_RE.test(stableTopic)) {
      catalog.push(stableTopic);
    }
  }
  return summarize(catalog, custom);
}

/** Applies send limits. Counts keep the real total; the flag reports the cut. */
function selectionProperties(
  prefix: 'interests' | 'affiliations',
  summary: SelectionSummary,
): Record<string, unknown> {
  const catalog = summary.catalog
    .filter((value) => value.length <= PROFILE_ID_ITEM_MAX_LENGTH)
    .slice(0, PROFILE_LIST_MAX_ITEMS);
  const limitText = (value: string) =>
    value.slice(0, PROFILE_TEXT_ITEM_MAX_LENGTH).trim();
  const custom = [...new Set(summary.custom.map(limitText))].slice(
    0,
    PROFILE_LIST_MAX_ITEMS,
  );
  const normalized = [
    ...new Set(summary.custom.map(normalizeForComparison).map(limitText)),
  ].slice(0, PROFILE_LIST_MAX_ITEMS);
  const truncated =
    catalog.length < summary.catalog.length ||
    summary.custom.length > PROFILE_LIST_MAX_ITEMS ||
    summary.custom.some((v) => v.length > PROFILE_TEXT_ITEM_MAX_LENGTH);
  return {
    [prefix]: catalog,
    [`${prefix}_custom`]: custom,
    [`${prefix}_custom_normalized`]: normalized,
    [`${prefix}_catalog_count`]: summary.catalogCount,
    [`${prefix}_custom_count`]: summary.customCount,
    [`${prefix}_count`]: summary.total,
    [`${prefix}_truncated`]: truncated,
  };
}

const AGE_LOWER_BOUNDS: readonly [number, AgeRange][] = [
  [65, '65+'],
  [55, '55-64'],
  [45, '45-54'],
  [35, '35-44'],
  [25, '25-34'],
  [18, '18-24'],
];

function bucketForAge(age: number): AgeRange | null {
  for (const [min, range] of AGE_LOWER_BOUNDS) {
    if (age >= min) return range;
  }
  return null;
}

export type AgeRangeResult =
  | { status: 'valid'; range: AgeRange }
  | { status: 'below_minimum' }
  | { status: 'unknown' };

const BIRTH_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Exact date when present. With only a birth year the age is ±1, so it reports a
 * range only when both possible ages agree. Never reclassifies a minor as adult.
 */
export function computeAgeRange(
  input: { birthDate?: unknown; birthYear?: unknown },
  now: Date,
): AgeRangeResult {
  const year = now.getUTCFullYear();
  const match =
    typeof input.birthDate === 'string'
      ? BIRTH_DATE_RE.exec(input.birthDate)
      : null;
  if (match) {
    const birthYear = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const beforeBirthday =
      now.getUTCMonth() + 1 < month ||
      (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
    const age = year - birthYear - (beforeBirthday ? 1 : 0);
    if (age < 0 || age > 130) return { status: 'unknown' };
    const range = bucketForAge(age);
    return range ? { status: 'valid', range } : { status: 'below_minimum' };
  }
  const birthYear = input.birthYear;
  if (typeof birthYear !== 'number' || !Number.isInteger(birthYear)) {
    return { status: 'unknown' };
  }
  const oldest = year - birthYear;
  if (oldest < 0 || oldest > 130) return { status: 'unknown' };
  if (oldest < 18) return { status: 'below_minimum' };
  const low = bucketForAge(oldest - 1);
  const high = bucketForAge(oldest);
  return low && low === high
    ? { status: 'valid', range: low }
    : { status: 'unknown' };
}

const MANUAL_SOCIAL_KEYS: readonly [string, SocialLinkUrlPlatform, AnalyticsSocialPlatform][] = [
  ['linkedin', 'linkedin', 'linkedin'],
  ['instagram', 'instagram', 'instagram'],
  ['facebook', 'facebook', 'facebook'],
  ['youtube', 'youtube', 'youtube'],
  ['twitter', 'x', 'x'],
  ['tiktok', 'tiktok', 'tiktok'],
  ['snapchat', 'snapchat', 'snapchat'],
  ['website', 'website', 'website'],
];

export function manualSocialPlatforms(
  links: unknown,
): AnalyticsSocialPlatform[] {
  const row = asRecord(links);
  if (!row) return [];
  const out: AnalyticsSocialPlatform[] = [];
  for (const [key, urlPlatform, platform] of MANUAL_SOCIAL_KEYS) {
    if (normalizeSocialLinkUrl(urlPlatform, row[key])) out.push(platform);
  }
  if (Array.isArray(row.custom) && row.custom.length > 0) out.push('custom');
  return out;
}

/**
 * Counts for the socials milestone. A network both manual and verified counts
 * once; each custom network counts. `verified` null means not known yet.
 */
export function countSocialConnections(
  links: unknown,
  verified: readonly string[] | null,
): {
  itemCount: number;
  manualCount: number;
  verifiedCount?: number;
  contentUnknown?: boolean;
} {
  const manual = manualSocialPlatforms(links).filter((p) => p !== 'custom');
  const customCount = customSocialKeys(links).size;
  const networks = new Set<string>([...manual, ...(verified ?? [])]);
  const itemCount = networks.size + customCount;
  return {
    itemCount,
    manualCount: manual.length + customCount,
    ...(verified
      ? { verifiedCount: verified.length }
      : { contentUnknown: itemCount === 0 }),
  };
}

function customSocialKeys(links: unknown): Set<string> {
  const row = asRecord(links);
  const keys = new Set<string>();
  if (!row || !Array.isArray(row.custom)) return keys;
  for (const item of row.custom) {
    const name = asRecord(item)?.name;
    if (typeof name === 'string' && name.trim()) {
      keys.add(normalizeForComparison(name));
    }
  }
  return keys;
}

/**
 * Networks that gained a link in this save. Editing an existing link or
 * hydrating a screen adds nothing. Each new custom network counts once.
 */
export function newlyAddedManualSocials(
  previous: unknown,
  next: unknown,
): AnalyticsSocialPlatform[] {
  const before = new Set(manualSocialPlatforms(previous));
  const added = manualSocialPlatforms(next).filter(
    (platform) => platform !== 'custom' && !before.has(platform),
  );
  const previousCustom = customSocialKeys(previous);
  for (const key of customSocialKeys(next)) {
    if (!previousCustom.has(key)) added.push('custom');
  }
  return added;
}

/**
 * What each network proved: true or false. A network missing from the record is
 * unknown and stays out of the verified list. Null when nothing is known at all.
 */
export type VerifiedSocialState =
  | Partial<Record<AnalyticsSocialPlatform, boolean>>
  | null;

export type PersonPropertyPatch = {
  set: Record<string, unknown>;
  unset: string[];
};

const selectionPropertyNames = (prefix: 'interests' | 'affiliations'): string[] => [
  prefix,
  `${prefix}_custom`,
  `${prefix}_custom_normalized`,
  `${prefix}_catalog_count`,
  `${prefix}_custom_count`,
  `${prefix}_count`,
  `${prefix}_truncated`,
];

const VERIFIED_DERIVED_NAMES = [
  'social_platforms_verified',
  'socials_connected',
  'has_socials',
];

/** Everything that belongs to one profile mode. */
export const MODE_SCOPED_PROPERTY_NAMES: readonly string[] = [
  'profile_type',
  'occupation',
  'occupation_truncated',
  ...selectionPropertyNames('interests'),
  ...selectionPropertyNames('affiliations'),
  'social_platforms_manual',
  ...VERIFIED_DERIVED_NAMES,
];

export type BuildPersonOptions = {
  /** PostHog already holds this mode's verified state, confirmed in this process. */
  verifiedConfirmedForMode?: boolean;
};

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Only the mode's own nested value. The top-level occupation of a legacy profile
 * cannot be shown to belong to the active mode (the switch runs in the backend),
 * so it is never reported: the property is unset instead. Firestore is untouched.
 */
function occupationForMode(doc: Record<string, unknown>, mode: ProfileMode): string {
  const profiles = asRecord(doc.profiles);
  return trimmedString(asRecord(profiles?.[mode])?.occupation);
}

export function buildPersonProperties(
  doc: Record<string, unknown>,
  verified: VerifiedSocialState,
  now: Date,
  options: BuildPersonOptions = {},
): PersonPropertyPatch {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];

  const birthCountry = normalizeCountryCode(doc.birthCountryCode);
  if (birthCountry) set.country_birth = birthCountry;
  else unset.push('country_birth');

  // Only the city the user chose. Never GPS or IP.
  const liveCountry = parseCurrentCity(doc.currentCity)?.countryCode;
  if (liveCountry) set.country_live = liveCountry;
  else if (doc.currentCity === undefined || doc.currentCity === null) {
    unset.push('country_live');
  }

  if (Array.isArray(doc.languageCodes)) {
    set.languages = doc.languageCodes.filter(
      (code) => typeof code === 'string' && code.length > 0,
    );
  }

  // Account name parts as the user saved them (top-level realName / lastName,
  // the account copy of the active face). Never split from a display name;
  // a removed value is unset so PostHog keeps nothing stale.
  for (const [property, field] of [
    ['first_name', 'realName'],
    ['last_name', 'lastName'],
  ] as const) {
    const value = trimmedString(doc[field]).slice(0, PERSON_NAME_MAX_LENGTH).trim();
    if (value) set[property] = value;
    else unset.push(property);
  }

  const age = computeAgeRange(doc, now);
  set.age_range_status = age.status;
  if (age.status === 'valid' && AGE_RANGES.includes(age.range)) {
    set.age_range = age.range;
  } else {
    unset.push('age_range');
  }

  const mode = doc.mode;
  if (!isProfileMode(mode)) {
    unset.push(...MODE_SCOPED_PROPERTY_NAMES);
    return { set, unset };
  }

  set.profile_type = mode;

  const occupation = occupationForMode(doc, mode);
  if (occupation) {
    set.occupation = occupation.slice(0, OCCUPATION_MAX_LENGTH).trim();
    set.occupation_truncated = occupation.length > OCCUPATION_MAX_LENGTH;
  } else {
    unset.push('occupation', 'occupation_truncated');
  }

  const interestRows = doc[`${mode}OnboardingInterests`];
  if (Array.isArray(interestRows)) {
    Object.assign(
      set,
      selectionProperties('interests', summarizeInterests(interestRows)),
    );
  } else {
    unset.push(...selectionPropertyNames('interests'));
  }

  const affiliationRows = doc[`${mode}OnboardingAffiliations`];
  if (Array.isArray(affiliationRows)) {
    Object.assign(
      set,
      selectionProperties(
        'affiliations',
        summarizeAffiliations(affiliationRows),
      ),
    );
  } else {
    unset.push(...selectionPropertyNames('affiliations'));
  }

  const manualBag =
    doc[mode === 'professional' ? 'socialLinksProfessional' : 'socialLinksPersonal'];
  const manual = manualSocialPlatforms(manualBag);
  if (asRecord(manualBag)) set.social_platforms_manual = manual;
  else unset.push('social_platforms_manual');
  if (verified) {
    const verifiedList = (
      Object.keys(verified) as AnalyticsSocialPlatform[]
    ).filter((platform) => verified[platform] === true);
    const connected = [...new Set([...manual, ...verifiedList])];
    set.social_platforms_verified = verifiedList;
    set.socials_connected = connected;
    set.has_socials = connected.length > 0;
  } else if (!options.verifiedConfirmedForMode) {
    // A failed lookup keeps what this mode confirmed, never another mode's value.
    unset.push(...VERIFIED_DERIVED_NAMES);
  }

  return { set, unset };
}

/** Keeps only what changed since the last send for this account. */
export function diffPersonProperties(
  previous: Readonly<Record<string, string>>,
  patch: PersonPropertyPatch,
): { patch: PersonPropertyPatch; next: Record<string, string> } {
  const next: Record<string, string> = { ...previous };
  const set: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(patch.set)) {
    const encoded = JSON.stringify(value);
    if (previous[name] !== encoded) set[name] = value;
    next[name] = encoded;
  }
  const unset: string[] = [];
  for (const name of patch.unset) {
    if (previous[name] !== '__unset__') unset.push(name);
    next[name] = '__unset__';
  }
  return { patch: { set, unset }, next };
}

const PROFILE_WRITE_KEYS = [
  'mode',
  'realName',
  'lastName',
  'occupation',
  'profiles',
  'birthCountryCode',
  'currentCity',
  'languageCodes',
  'birthDate',
  'birthYear',
  'personalOnboardingInterests',
  'professionalOnboardingInterests',
  'personalOnboardingAffiliations',
  'professionalOnboardingAffiliations',
  'socialLinksPersonal',
  'socialLinksProfessional',
];

export function profileWriteAffectsAnalytics(
  patch: Readonly<Record<string, unknown>>,
): boolean {
  return PROFILE_WRITE_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
}
