/**
 * Person properties, read from auth and users/{uid}. A confirmed empty value is
 * sent explicitly (`[]`, `null`). An unknown one is left out of the update, and
 * `personKeysToUnset` decides whether the stored value must be removed as well.
 *
 * Only the fields listed here leave the device; no other profile text does.
 */
import { isProfileMode } from '../profile/profileModeFields.ts';
import type { AnalyticsProperties } from './analyticsContract.ts';
import {
  listProperties,
  splitAffiliations,
  splitInterests,
} from './analyticsProfileLists.ts';
import { readManualPlatforms, socialProperties } from './analyticsSocial.ts';

function nonBlank(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildBasePersonProperties(input: {
  authEmail: unknown;
  docEmail?: unknown;
  appVersion?: string;
}): AnalyticsProperties {
  const out: AnalyticsProperties = { platform: 'Android' };
  if (input.appVersion) out.app_version = input.appVersion;
  const email = nonBlank(input.authEmail) ?? nonBlank(input.docEmail);
  if (email) out.email = email;
  return out;
}

/**
 * Only the active mode's own field. The product also shows a top-level legacy
 * value for the active mode, but nothing in the document says which mode wrote
 * it, so analytics treats it as unknown and the stored value is removed.
 */
function readOccupation(
  doc: Record<string, unknown>,
  mode: string,
): string | null | undefined {
  const profiles = doc.profiles as
    | Record<string, Record<string, unknown> | undefined>
    | undefined;
  const nested = profiles?.[mode]?.occupation;
  if (typeof nested !== 'string') return undefined;
  return nonBlank(nested);
}

/** Agreed with iOS and Functions: person properties only, at most 80 characters. */
export const PERSON_NAME_MAX = 80;
/** Removed with $unset when the account field is blank; never written as null. */
export const PERSON_NAME_KEYS = ['first_name', 'last_name'] as const;

/**
 * Account field as stored (top-level `realName` / `lastName`). A display name is
 * never split to produce one. Cut by characters, not UTF-16 units.
 */
function readPersonName(value: unknown): string | undefined {
  const name = nonBlank(value);
  if (name === null) return undefined;
  const chars = Array.from(name);
  return chars.length > PERSON_NAME_MAX ? chars.slice(0, PERSON_NAME_MAX).join('').trim() : name;
}

const COUNTRY_CODE = /^[A-Za-z]{2}$/;

function toCountryCode(value: unknown): string | null {
  return typeof value === 'string' && COUNTRY_CODE.test(value.trim())
    ? value.trim().toUpperCase()
    : null;
}

/** Declared origin. Empty clears; absent stays unknown. */
function readCountryBirth(doc: Record<string, unknown>): string | null | undefined {
  if (!('birthCountryCode' in doc)) return undefined;
  return toCountryCode(doc.birthCountryCode);
}

/** The declared city only, never GPS or IP. */
function readCountryLive(doc: Record<string, unknown>): string | null | undefined {
  if (!('currentCity' in doc)) return undefined;
  if (doc.currentCity === null) return null;
  const code = toCountryCode(
    (doc.currentCity as { countryCode?: unknown } | undefined)?.countryCode,
  );
  return code ?? undefined;
}

const AGE_RANGES: ReadonlyArray<readonly [number, string]> = [
  [65, '65+'],
  [55, '55-64'],
  [45, '45-54'],
  [35, '35-44'],
  [25, '25-34'],
  [18, '18-24'],
];

/**
 * Undefined for a date that cannot be read; null for anyone under 18, so a
 * minor is never classified as an adult and an older value is cleared.
 */
export function computeAgeRange(
  birthDate: unknown,
  now: Date,
): string | null | undefined {
  if (birthDate === null) return null;
  if (typeof birthDate !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getTime() > now.getTime()
  ) {
    return undefined;
  }
  let age = now.getFullYear() - year;
  const monthNow = now.getMonth() + 1;
  if (monthNow < month || (monthNow === month && now.getDate() < day)) age -= 1;
  for (const [minimum, label] of AGE_RANGES) {
    if (age >= minimum) return label;
  }
  return null;
}

function hasLegacyRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * The profile document is complete, and the product reads an absent list as
 * empty, so this also clears the lists of the previous mode after a switch.
 * Legacy rows are the exception: the product still shows them, and they have no
 * stable ids, so the state is unknown rather than empty.
 */
function modeInterests(doc: Record<string, unknown>, mode: string): unknown[] | undefined {
  const rows = doc[`${mode}OnboardingInterests`];
  if (Array.isArray(rows)) return rows;
  return hasLegacyRows(doc[`${mode}Interests`]) ? undefined : [];
}

function modeAffiliations(doc: Record<string, unknown>, mode: string): unknown[] | undefined {
  const rows = doc[`${mode}OnboardingAffiliations`];
  if (Array.isArray(rows) && rows.length > 0) return rows;
  return hasLegacyRows(doc[`${mode}Affiliations`]) ? undefined : [];
}

function listKeys(prefix: 'interests' | 'affiliations'): string[] {
  return ['', '_custom', '_custom_normalized', '_count', '_catalog_count', '_custom_count'].map(
    (suffix) => `${prefix}${suffix}`,
  );
}

/** What the document alone decides: if absent from an update, it is not knowable. */
const MODE_KEYS_FROM_DOCUMENT = [
  'occupation',
  ...listKeys('interests'),
  ...listKeys('affiliations'),
  'social_platforms_manual',
];
const VERIFIED_KEY = 'social_platforms_verified';
const COMBINED_SOCIAL_KEYS = ['socials_connected', 'has_socials'];

/** Everything that describes one mode; none of it may outlive a switch unchecked. */
export const MODE_SCOPED_PERSON_PROPERTIES: readonly string[] = [
  'profile_type',
  ...MODE_KEYS_FROM_DOCUMENT,
  VERIFIED_KEY,
  ...COMBINED_SOCIAL_KEYS,
];

/**
 * Stored person values to remove. Unknown is not empty, so nothing is written in
 * their place: the property simply stops existing until a real value is known.
 *
 * - The document is complete, so a document field it cannot resolve (legacy rows,
 *   a malformed bag) can only hold another mode's value. Always removed.
 * - Verified networks come from reads that can fail. A failure in the same mode
 *   keeps the last confirmed value; after a switch that value is another mode's.
 * - No readable mode: nothing can be attributed, but only a person this device
 *   has written for has anything to remove.
 */
export function personKeysToUnset(input: {
  doc: unknown;
  properties: AnalyticsProperties;
  /** Mode of the last update written for this account; null when none is known. */
  previousMode: string | null;
}): string[] {
  const row = input.doc as { mode?: unknown } | null | undefined;
  const absent = (key: string) => !(key in input.properties);
  // Account names do not depend on the mode: the complete document has none.
  const names = row && typeof row === 'object' ? PERSON_NAME_KEYS.filter(absent) : [];
  if (!isProfileMode(row?.mode)) {
    return [
      ...names,
      ...(input.previousMode === null ? [] : MODE_SCOPED_PERSON_PROPERTIES),
    ];
  }
  const unset: string[] = [...names, ...MODE_KEYS_FROM_DOCUMENT.filter(absent)];
  const verifiedStale = absent(VERIFIED_KEY) && input.previousMode !== row?.mode;
  if (verifiedStale) unset.push(VERIFIED_KEY);
  if (verifiedStale || absent('social_platforms_manual')) {
    unset.push(...COMBINED_SOCIAL_KEYS.filter(absent));
  }
  return unset;
}

const PERSON_MODE_KEY_PREFIX = 'NEARSY_ANALYTICS_PERSON_MODE:';

/**
 * Remembers the mode last written per account, so a restart can tell a failed read
 * in the same mode from a switch. Local only; a failed read means "not known".
 */
export function createPersonModeMemory(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}) {
  return {
    async read(uid: string): Promise<string | null> {
      try {
        return await storage.getItem(`${PERSON_MODE_KEY_PREFIX}${uid}`);
      } catch {
        return null;
      }
    },
    async write(uid: string, mode: unknown): Promise<void> {
      if (!isProfileMode(mode)) return;
      try {
        await storage.setItem(`${PERSON_MODE_KEY_PREFIX}${uid}`, mode);
      } catch {
        // The next update treats the mode as not known, which is the safe side.
      }
    },
  };
}

export function buildPersonProperties(input: {
  doc: unknown;
  authEmail: unknown;
  appVersion?: string;
  normalizeLanguages: (values: unknown) => string[];
  /** Verified networks of a mode; undefined while they are unknown. */
  verifiedSocialsFor?: (mode: string) => string[] | undefined;
  now?: Date;
}): AnalyticsProperties | null {
  const doc = input.doc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const row = doc as Record<string, unknown>;

  const out = buildBasePersonProperties({
    authEmail: input.authEmail,
    docEmail: row.email,
    appVersion: input.appVersion,
  });
  const firstName = readPersonName(row.realName);
  if (firstName !== undefined) out.first_name = firstName;
  const lastName = readPersonName(row.lastName);
  if (lastName !== undefined) out.last_name = lastName;
  if (isProfileMode(row.mode)) {
    out.profile_type = row.mode;
    const occupation = readOccupation(row, row.mode);
    if (occupation !== undefined) out.occupation = occupation;

    const interests = modeInterests(row, row.mode);
    if (interests) Object.assign(out, listProperties('interests', splitInterests(interests)));
    const affiliations = modeAffiliations(row, row.mode);
    if (affiliations) {
      Object.assign(out, listProperties('affiliations', splitAffiliations(affiliations)));
    }
    Object.assign(
      out,
      socialProperties(
        readManualPlatforms(row, row.mode),
        input.verifiedSocialsFor?.(row.mode),
      ),
    );
  }
  if (Array.isArray(row.languageCodes)) {
    out.languages = input.normalizeLanguages(row.languageCodes);
  }
  const countryBirth = readCountryBirth(row);
  if (countryBirth !== undefined) out.country_birth = countryBirth;
  const countryLive = readCountryLive(row);
  if (countryLive !== undefined) out.country_live = countryLive;
  const ageRange = computeAgeRange(row.birthDate, input.now ?? new Date());
  if (ageRange !== undefined) out.age_range = ageRange;
  return out;
}
