/**
 * Callable HTTP transport for `searchCities` (Firebase JS ID token + App Check).
 *
 * Until the Function is deployed the endpoint answers 404, which maps to
 * UNAVAILABLE: the field stays optional and the user can continue.
 */

import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../firebase/callableHttp';
import {
  CITY_SEARCH_TIMEOUT_MS,
  CitySearchClientError,
  SEARCH_CITIES_FUNCTION,
  parseCitySearchResponse,
  type CitySearchRequest,
  type CurrentCity,
} from './currentCity';

export const CITY_SEARCH_CALLABLE_PROJECTS = ['nearsy-dev', 'nearsy-pj'] as const;
export const CITY_SEARCH_CALLABLE_REGION = 'us-central1' as const;

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
        data: { ...input.request },
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
