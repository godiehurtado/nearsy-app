/**
 * Android composition for `searchCities`: RNFirebase ID token + App Check
 * token over callable HTTP (same transport as affiliation search), so the
 * request can be aborted. Requires a signed-in user and a ready App Check
 * before any network call. Never calls GeoNames and never logs.
 */

import Constants from 'expo-constants';

import { firebaseAuth } from '../config/firebaseConfig';
import {
  ensureAppCheckInitialized,
  ensureAppCheckTokenFoundation,
} from '../config/appCheckBootstrap';
import {
  CITY_SEARCH_CALLABLE_REGION,
  invokeCitySearchCallable,
} from './citySearchCallable.ts';
import {
  CitySearchClientError,
  type CitySearchRequest,
  type CurrentCity,
} from './currentCity.ts';

function unavailable(): CitySearchClientError {
  return new CitySearchClientError('UNAVAILABLE', 'City search is unavailable.');
}

function resolveProjectId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const project = extra.nearsyFirebaseProjectId;
  return typeof project === 'string' ? project.trim().toLowerCase() : '';
}

async function getAppCheckToken(): Promise<string> {
  const status = await ensureAppCheckInitialized();
  if (status.status !== 'ready') throw unavailable();
  await ensureAppCheckTokenFoundation();
  // Lazy require keeps Node tests free of the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const appCheckModule = require('@react-native-firebase/app-check');
  const appCheck =
    typeof appCheckModule.getAppCheck === 'function'
      ? appCheckModule.getAppCheck()
      : appCheckModule.default();
  let result: { token?: string } | undefined;
  if (typeof appCheck?.getToken === 'function') {
    result = await appCheck.getToken(false);
  } else if (typeof appCheckModule.getToken === 'function') {
    result = await appCheckModule.getToken(appCheck, false);
  }
  const token = typeof result?.token === 'string' ? result.token.trim() : '';
  if (!token) throw unavailable();
  return token;
}

export async function searchCitiesRemote(
  request: CitySearchRequest,
  signal: AbortSignal,
): Promise<CurrentCity[]> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new CitySearchClientError(
      'UNAUTHENTICATED',
      'City search requires sign-in.',
    );
  }
  try {
    const idToken = await user.getIdToken();
    if (!idToken?.trim()) {
      throw new CitySearchClientError(
        'UNAUTHENTICATED',
        'City search requires sign-in.',
      );
    }
    const appCheckToken = await getAppCheckToken();
    if (signal.aborted) {
      throw new CitySearchClientError('CANCELLED', 'City search was cancelled.');
    }
    return await invokeCitySearchCallable({
      projectId: resolveProjectId(),
      region: CITY_SEARCH_CALLABLE_REGION,
      idToken,
      appCheckToken,
      request,
      signal,
    });
  } catch (err) {
    throw err instanceof CitySearchClientError ? err : unavailable();
  }
}
