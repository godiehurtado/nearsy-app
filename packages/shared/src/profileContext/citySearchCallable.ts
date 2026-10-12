/**
 * Callable HTTP transport for `searchCities` (Firebase ID token + App Check).
 *
 * Fixed region and allowlisted projects; errors carry fixed messages only, so
 * the query, results, UID and tokens never reach logs or thrown text.
 */

import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../firebase/callableHttp.ts';
import {
  CITY_SEARCH_TIMEOUT_MS,
  CitySearchClientError,
  SEARCH_CITIES_FUNCTION,
  clampCitySearchLimit,
  mapCitySearchError,
  normalizeCitySearchQuery,
  parseCitySearchResponse,
  type CitySearchRequest,
  type CurrentCity,
} from './currentCity.ts';

export const CITY_SEARCH_CALLABLE_PROJECTS = ['nearsy-dev', 'nearsy-pj'] as const;
export const CITY_SEARCH_CALLABLE_REGION = 'us-central1' as const;

/** Wire payload: `preferredCountryCode` only accompanies the empty query. */
export function buildCitySearchPayload(
  request: CitySearchRequest,
): Record<string, unknown> {
  const query = normalizeCitySearchQuery(request.query);
  const payload: Record<string, unknown> = {
    query,
    limit: clampCitySearchLimit(request.limit),
  };
  const preferred = request.preferredCountryCode?.trim().toUpperCase();
  if (query.length === 0 && preferred && /^[A-Z]{2}$/.test(preferred)) {
    payload.preferredCountryCode = preferred;
  }
  return payload;
}

export async function invokeCitySearchCallable(
  input: {
    projectId: string;
    region: string;
    idToken: string;
    appCheckToken: string;
    request: CitySearchRequest;
    signal?: AbortSignal;
  },
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<CurrentCity[]> {
  const project = input.projectId.trim().toLowerCase();
  const region = input.region.trim().toLowerCase();
  if (
    !(CITY_SEARCH_CALLABLE_PROJECTS as readonly string[]).includes(project) ||
    region !== CITY_SEARCH_CALLABLE_REGION
  ) {
    throw new CitySearchClientError(
      'UNAVAILABLE',
      'City search requires a known Firebase project.',
    );
  }

  let payload: unknown;
  try {
    payload = await invokeFirebaseCallableHttp(
      {
        url: buildCloudFunctionsCallableUrl(
          project,
          region,
          SEARCH_CITIES_FUNCTION,
        ),
        idToken: input.idToken,
        appCheckToken: input.appCheckToken,
        data: buildCitySearchPayload(input.request),
        timeoutMs: CITY_SEARCH_TIMEOUT_MS,
        signal: input.signal,
      },
      deps,
    );
  } catch (err) {
    if (isFirebaseCallableHttpError(err) && err.httpStatus === 401) {
      throw new CitySearchClientError(
        'UNAUTHENTICATED',
        'City search requires sign-in.',
      );
    }
    throw mapCitySearchError(err);
  }
  return parseCitySearchResponse(payload, input.request.limit);
}
