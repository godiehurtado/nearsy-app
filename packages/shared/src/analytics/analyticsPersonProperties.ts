/**
 * Person properties of the foundation batch, read from auth and users/{uid}.
 * An unknown value is omitted. A confirmed empty one is sent explicitly:
 * `[]` for languages and `null` for occupation.
 */
import { isProfileMode } from '../profile/profileModeFields.ts';
import type { AnalyticsProperties } from './analyticsContract.ts';

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

export function buildPersonProperties(input: {
  doc: unknown;
  authEmail: unknown;
  appVersion?: string;
  normalizeLanguages: (values: unknown) => string[];
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
  }
  if (Array.isArray(row.languageCodes)) {
    out.languages = input.normalizeLanguages(row.languageCodes);
  }
  return out;
}
