/**
 * Current city search state machine (UI-agnostic).
 *
 * - Opening sends `query: ''` with the device-region country as a ranking
 *   preference (no location permission involved).
 * - Typing 2+ characters searches worldwide: the preference is not sent.
 * - Debounced; one-character queries never reach the network; the previous
 *   request is aborted and any response that is not the latest is ignored.
 * - Errors are temporary: `retry()` re-runs the current query immediately.
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
} from './currentCity.ts';

export type CitySearchErrorReason = 'rate-limited' | 'unavailable';

export type CitySearchState =
  | { status: 'idle'; query: string }
  | { status: 'loading'; query: string }
  | { status: 'suggestions'; query: string; results: CurrentCity[] }
  | { status: 'results'; query: string; results: CurrentCity[] }
  | { status: 'empty'; query: string }
  | { status: 'error'; query: string; reason: CitySearchErrorReason };

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
  retry: () => void;
  dispose: () => void;
};

export function citySearchErrorReason(err: unknown): CitySearchErrorReason {
  return err instanceof CitySearchClientError && err.code === 'RATE_LIMITED'
    ? 'rate-limited'
    : 'unavailable';
}

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
  let preferred: string | null = null;
  let suggestions: CurrentCity[] = [];
  let currentQuery = '';
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
  ) => {
    const mySeq = seq;
    const controller = new AbortController();
    inFlight = controller;
    let pending: Promise<CurrentCity[]>;
    try {
      pending = deps.search(request, controller.signal);
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(
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
        emit({
          status: 'error',
          query: request.query,
          reason: citySearchErrorReason(err),
        });
      },
    );
  };

  const loadSuggestions = () => {
    if (!preferred) {
      emit({ status: 'idle', query: '' });
      return;
    }
    emit({ status: 'loading', query: '' });
    run({ query: '', limit, preferredCountryCode: preferred }, (results) => {
      suggestions = results;
      emit(
        results.length > 0
          ? { status: 'suggestions', query: '', results }
          : { status: 'idle', query: '' },
      );
    });
  };

  const searchNow = (query: string) => {
    run({ query, limit }, (results) =>
      emit(
        results.length > 0
          ? { status: 'results', query, results }
          : { status: 'empty', query },
      ),
    );
  };

  return {
    open(preferredCountryCode) {
      cancelPending();
      seq += 1;
      preferred = preferredCountryCode || null;
      suggestions = [];
      currentQuery = '';
      loadSuggestions();
    },

    setQuery(rawQuery) {
      cancelPending();
      seq += 1;
      const query = normalizeCitySearchQuery(rawQuery);
      currentQuery = query;
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
        searchNow(query);
      }, debounceMs);
    },

    retry() {
      cancelPending();
      seq += 1;
      if (shouldSearchCities(currentQuery)) {
        emit({ status: 'loading', query: currentQuery });
        searchNow(currentQuery);
      } else if (currentQuery.length === 0) {
        loadSuggestions();
      }
    },

    dispose() {
      disposed = true;
      cancelPending();
    },
  };
}
