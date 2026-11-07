/**
 * Person properties, read from auth and users/{uid}. An unknown value is
 * omitted. A confirmed empty one is sent explicitly (`[]`, `null`), which clears
 * a value stored earlier.
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

/** Same precedence as `resolveModePresentation`: active mode, then top level. */
function readOccupation(
  doc: Record<string, unknown>,
  mode: string,
): string | null | undefined {
  const profiles = doc.profiles as
    | Record<string, Record<string, unknown> | undefined>
    | undefined;
  const nested = profiles?.[mode]?.occupation;
  const top = doc.occupation;
  const value = nonBlank(nested) ?? nonBlank(top);
  if (value) return value;
  return typeof nested === 'string' || typeof top === 'string' ? null : undefined;
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
