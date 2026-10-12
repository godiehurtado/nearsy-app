/**
 * Current city search state machine (UI-agnostic).
 *
 * - Opening with a preferred country loads suggestions for that country.
 * - Typing searches globally: the preferred country is not sent.
 * - Debounced, minimum length, previous request aborted, and any response that
 *   is not the latest is ignored, so an old search never replaces a new one.
 * - Nothing here persists or logs the query.
 */

import {
  CITY_SEARCH_DEBOUNCE_MS,
  CitySearchClientError,
  clampCitySearchLimit,
  normalizeCitySearchQuery,
  shouldSearchCities,
  type CitySearchRequest,
  type CurrentCity,
} from './currentCity';

export type CitySearchState =
  | { status: 'idle'; query: string }
  | { status: 'loading'; query: string }
  | { status: 'suggestions'; query: string; results: CurrentCity[] }
  | { status: 'results'; query: string; results: CurrentCity[] }
  | { status: 'empty'; query: string }
  | { status: 'error'; query: string };

export type CitySearchFn = (
  request: CitySearchRequest,
  signal: AbortSignal,
) => Promise<CurrentCity[]>;

export type CitySearchControllerDeps = {
  search: CitySearchFn;
  onChange: (state: CitySearchState) => void;
  debounceMs?: number;
  limit?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
};

export type CitySearchController = {
  open: (preferredCountryCode?: string | null) => void;
  setQuery: (query: string) => void;
  dispose: () => void;
};

export function createCitySearchController(
  deps: CitySearchControllerDeps,
): CitySearchController {
  const debounceMs = deps.debounceMs ?? CITY_SEARCH_DEBOUNCE_MS;
  const limit = clampCitySearchLimit(deps.limit);
  const schedule =
    deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancelSchedule =
    deps.cancelSchedule ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let seq = 0;
  let timer: unknown = null;
  let inFlight: AbortController | null = null;
  let suggestions: CurrentCity[] = [];
  let disposed = false;

  const emit = (state: CitySearchState) => {
    if (!disposed) deps.onChange(state);
  };

  const cancelPending = () => {
    if (timer !== null) {
      cancelSchedule(timer);
      timer = null;
    }
    inFlight?.abort();
    inFlight = null;
  };

  const run = (
    request: CitySearchRequest,
    onResults: (results: CurrentCity[]) => void,
    onError: () => void,
  ) => {
    const mySeq = seq;
    const controller = new AbortController();
    inFlight = controller;
    deps.search(request, controller.signal).then(
      (results) => {
        if (disposed || mySeq !== seq) return;
        inFlight = null;
        onResults(results.slice(0, limit));
      },
      (err) => {
        if (disposed || mySeq !== seq) return;
        inFlight = null;
        if (err instanceof CitySearchClientError && err.code === 'CANCELLED') {
          return;
        }
        onError();
      },
    );
  };

  return {
    open(preferredCountryCode) {
      cancelPending();
      seq += 1;
      suggestions = [];
      if (!preferredCountryCode) {
        emit({ status: 'idle', query: '' });
        return;
      }
      emit({ status: 'loading', query: '' });
      run(
        { query: '', limit, preferredCountryCode },
        (results) => {
          suggestions = results;
          emit(
            results.length > 0
              ? { status: 'suggestions', query: '', results }
              : { status: 'idle', query: '' },
          );
        },
        // Suggestions are optional: fall back to the typing hint silently.
        () => emit({ status: 'idle', query: '' }),
      );
    },

    setQuery(rawQuery) {
      cancelPending();
      seq += 1;
      const query = normalizeCitySearchQuery(rawQuery);
      if (!shouldSearchCities(query)) {
        emit(
          query.length === 0 && suggestions.length > 0
            ? { status: 'suggestions', query, results: suggestions }
            : { status: 'idle', query },
        );
        return;
      }
      emit({ status: 'loading', query });
      timer = schedule(() => {
        timer = null;
        run(
          { query, limit },
          (results) =>
            emit(
              results.length > 0
                ? { status: 'results', query, results }
                : { status: 'empty', query },
            ),
          () => emit({ status: 'error', query }),
        );
      }, debounceMs);
    },

    dispose() {
      disposed = true;
      cancelPending();
    },
  };
}
