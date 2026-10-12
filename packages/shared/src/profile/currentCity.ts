/**
 * Current city — optional top-level profile context (`users/{uid}.currentCity`).
 *
 * Cities come from GeoNames through Nearsy's `searchCities` Function only;
 * the app never calls GeoNames. Identity is `provider` + `id`, so two cities
 * with the same name stay distinct. Coordinates and provider extras are never
 * stored or published: parsing keeps only the contract fields.
 */

import { normalizeCountryCode } from './countryCatalog';

export const CURRENT_CITY_PROVIDER = 'geonames' as const;
export const SEARCH_CITIES_FUNCTION = 'searchCities' as const;

export const CITY_SEARCH_MIN_QUERY = 2;
export const CITY_SEARCH_MAX_QUERY = 80;
export const CITY_SEARCH_DEFAULT_LIMIT = 8;
export const CITY_SEARCH_MAX_LIMIT = 10;
export const CITY_SEARCH_DEBOUNCE_MS = 300;
export const CITY_SEARCH_TIMEOUT_MS = 8_000;

const CITY_TEXT_MAX = 120;
/** GeoNames IDs are positive integers, serialized as strings. */
const GEONAMES_ID = /^[1-9]\d{0,11}$/;

export type CurrentCity = {
  id: string;
  provider: typeof CURRENT_CITY_PROVIDER;
  name: string;
  countryCode: string;
  region?: string;
};

export type CitySearchRequest = {
  query: string;
  limit: number;
  /** Ranking hint for the empty-query opening suggestions only; never a filter. */
  preferredCountryCode?: string;
};

export type CitySearchErrorCode =
  | 'UNAVAILABLE'
  | 'UNAUTHENTICATED'
  | 'INVALID_RESPONSE'
  | 'CANCELLED';

export class CitySearchClientError extends Error {
  readonly code: CitySearchErrorCode;

  constructor(code: CitySearchErrorCode, message: string) {
    super(message);
    this.name = 'CitySearchClientError';
    this.code = code;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > CITY_TEXT_MAX) return null;
  return text;
}

/** Strict parse; anything outside the contract returns null. */
export function parseCurrentCity(value: unknown): CurrentCity | null {
  if (!isPlainObject(value)) return null;
  if (value.provider !== CURRENT_CITY_PROVIDER) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!GEONAMES_ID.test(id)) return null;
  const name = cleanText(value.name);
  const countryCode = normalizeCountryCode(value.countryCode);
  if (!name || !countryCode) return null;
  const region = cleanText(value.region);
  const city: CurrentCity = {
    id,
    provider: CURRENT_CITY_PROVIDER,
    name,
    countryCode,
  };
  if (region) city.region = region;
  return city;
}

export function currentCityKey(city: CurrentCity): string {
  return `${city.provider}:${city.id}`;
}

export function isSameCurrentCity(
  a: CurrentCity | null | undefined,
  b: CurrentCity | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.provider === b.provider &&
    a.id === b.id &&
    a.name === b.name &&
    a.countryCode === b.countryCode &&
    (a.region ?? null) === (b.region ?? null)
  );
}

export function normalizeCitySearchQuery(query: string): string {
  return String(query ?? '').trim().replace(/\s+/g, ' ');
}

export function shouldSearchCities(query: string): boolean {
  const normalized = normalizeCitySearchQuery(query);
  return (
    normalized.length >= CITY_SEARCH_MIN_QUERY &&
    normalized.length <= CITY_SEARCH_MAX_QUERY
  );
}

export function clampCitySearchLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return CITY_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(CITY_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * `{ results: CurrentCity[] }` from searchCities. A malformed envelope throws;
 * malformed rows are skipped, duplicates (same provider + id) collapse.
 */
export function parseCitySearchResponse(
  data: unknown,
  limit: number = CITY_SEARCH_DEFAULT_LIMIT,
): CurrentCity[] {
  if (!isPlainObject(data) || !Array.isArray(data.results)) {
    throw new CitySearchClientError(
      'INVALID_RESPONSE',
      'Invalid city search response.',
    );
  }
  const max = clampCitySearchLimit(limit);
  const seen = new Set<string>();
  const out: CurrentCity[] = [];
  for (const row of data.results) {
    const city = parseCurrentCity(row);
    if (!city) continue;
    const key = currentCityKey(city);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(city);
    if (out.length >= max) break;
  }
  return out;
}

/** "Springfield, Illinois, United States" — region only when provided. */
export function formatCurrentCityPlace(
  city: CurrentCity,
  countryName: string,
): string {
  return [city.name, city.region, countryName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');
}

/** Device region as a non-binding hint; no location permission involved. */
export function resolvePreferredCityCountryCode(
  locales: ReadonlyArray<{ regionCode?: string | null }> | null | undefined,
): string | null {
  for (const locale of locales ?? []) {
    const code = normalizeCountryCode(locale?.regionCode);
    if (code) return code;
  }
  return null;
}
