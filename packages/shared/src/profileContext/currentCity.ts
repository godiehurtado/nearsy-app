/**
 * Current city — optional top-level profile context (`users/{uid}.currentCity`).
 *
 * Cities come from GeoNames only through Nearsy's `searchCities` Function; the
 * app never calls GeoNames. Identity is `provider` + `id`, so two cities with
 * the same name stay distinct. Coordinates and provider extras are never
 * stored, published or shown: parsing keeps only the contract fields.
 *
 * Self-contained (no catalog imports) so the contract runs under Node tests.
 */

export const CURRENT_CITY_PROVIDER = 'geonames' as const;
export const SEARCH_CITIES_FUNCTION = 'searchCities' as const;

export const CITY_SEARCH_MIN_QUERY = 2;
export const CITY_SEARCH_MAX_QUERY = 80;
export const CITY_SEARCH_DEFAULT_LIMIT = 8;
export const CITY_SEARCH_MAX_LIMIT = 8;
export const CITY_SEARCH_DEBOUNCE_MS = 300;
export const CITY_SEARCH_TIMEOUT_MS = 8_000;

const CITY_TEXT_MAX = 120;
/** GeoNames IDs are positive integers serialized as strings. */
const GEONAMES_ID = /^[1-9]\d{0,11}$/;
const ISO_ALPHA2_UPPER = /^[A-Z]{2}$/;

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
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'INVALID_RESPONSE'
  | 'CANCELLED';

/** Messages are fixed strings: never the query, a city, a UID or a token. */
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

const CURRENT_CITY_KEYS: ReadonlySet<string> = new Set([
  'id',
  'provider',
  'name',
  'countryCode',
  'region',
]);

export const CITY_COORDINATE_KEYS = [
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'geohash',
  'coordinates',
  'location',
] as const;

export function hasCityCoordinateKeys(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    CITY_COORDINATE_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

/**
 * Strict parse mirroring Functions `normalizeCurrentCity`: any key outside the
 * contract (coordinates, population, provider extras) or a malformed field
 * returns null. `countryCode` must already be ISO alpha-2 uppercase.
 */
export function parseCurrentCity(value: unknown): CurrentCity | null {
  if (!isPlainObject(value)) return null;
  for (const key of Object.keys(value)) {
    if (!CURRENT_CITY_KEYS.has(key)) return null;
  }
  if (value.provider !== CURRENT_CITY_PROVIDER) return null;
  if (typeof value.id !== 'string' || !GEONAMES_ID.test(value.id)) return null;
  const name = cleanText(value.name);
  if (!name) return null;
  if (
    typeof value.countryCode !== 'string' ||
    !ISO_ALPHA2_UPPER.test(value.countryCode)
  ) {
    return null;
  }
  const city: CurrentCity = {
    id: value.id,
    provider: CURRENT_CITY_PROVIDER,
    name,
    countryCode: value.countryCode,
  };
  if (value.region !== undefined) {
    const region = cleanText(value.region);
    if (!region) return null;
    city.region = region;
  }
  return city;
}

export function currentCityKey(city: CurrentCity): string {
  return `${city.provider}:${city.id}`;
}

/** Same stored value (identity and labels); used for dirty checks and writes. */
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
 * `{ results: CurrentCity[] }` from searchCities. A malformed envelope or any
 * row carrying coordinates throws; other malformed rows are skipped and
 * duplicates (same provider + id) collapse.
 */
export function parseCitySearchResponse(
  data: unknown,
  limit: number = CITY_SEARCH_DEFAULT_LIMIT,
): CurrentCity[] {
  if (
    !isPlainObject(data) ||
    !Array.isArray(data.results) ||
    data.results.some(hasCityCoordinateKeys)
  ) {
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

/** Maps callable/transport failures to user-safe categories. */
export function mapCitySearchError(err: unknown): CitySearchClientError {
  if (err instanceof CitySearchClientError) return err;
  const code = String((err as { code?: unknown })?.code ?? '')
    .replace(/^functions\//i, '')
    .toLowerCase();
  if (code === 'cancelled') {
    return new CitySearchClientError('CANCELLED', 'City search was cancelled.');
  }
  if (code === 'unauthenticated') {
    return new CitySearchClientError(
      'UNAUTHENTICATED',
      'City search requires sign-in.',
    );
  }
  if (code === 'resource-exhausted') {
    return new CitySearchClientError(
      'RATE_LIMITED',
      'Too many city searches. Try again shortly.',
    );
  }
  return new CitySearchClientError('UNAVAILABLE', 'City search is unavailable.');
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
    const code =
      typeof locale?.regionCode === 'string'
        ? locale.regionCode.trim().toUpperCase()
        : '';
    if (ISO_ALPHA2_UPPER.test(code)) return code;
  }
  return null;
}
