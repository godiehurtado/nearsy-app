/**
 * Non-iOS stub — `searchCities` is wired only through the iOS composition.
 */
import {
  CitySearchClientError,
  type CitySearchRequest,
  type CurrentCity,
} from './currentCity';

export async function searchCitiesRemote(
  _request: CitySearchRequest,
  _signal: AbortSignal,
): Promise<CurrentCity[]> {
  throw new CitySearchClientError('UNAVAILABLE', 'City search is unavailable.');
}
