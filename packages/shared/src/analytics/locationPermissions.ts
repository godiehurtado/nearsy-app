/**
 * foreground_location / background_location report permission only. They say
 * nothing about visibility or location publishing, and never carry coordinates.
 *
 * iOS equivalence:
 * - foreground granted: expo-location foreground status `granted`, which is
 *   While Using or Always.
 * - background granted: effective Always (`iosScope === 'always'`).
 *
 * Emits when a request resolves for a kind with no earlier decision, or when the
 * granted value changes (for example, back from Settings). The first observation
 * of an existing install only stores a baseline. Republishing location never
 * reaches this code.
 */
import type { StringStore } from './lifecycle';

export type LocationPermissionKind = 'foreground' | 'background';

export type LocationPermissionReading = {
  granted: boolean;
  /** False while iOS has not asked yet. */
  decided: boolean;
};

export type LocationPermissionReadings = Record<
  LocationPermissionKind,
  LocationPermissionReading
>;

type Baseline = Partial<Record<LocationPermissionKind, LocationPermissionReading>>;

export const LOCATION_PERMISSION_BASELINE_KEY =
  'nearsy.analytics.locationPermissions.v1';

const KINDS: readonly LocationPermissionKind[] = ['foreground', 'background'];

export type LocationPermissionObserverDeps = {
  store: StringStore | null;
  read: () => Promise<LocationPermissionReadings>;
  onChange: (kind: LocationPermissionKind, granted: boolean) => void;
  onState: (readings: LocationPermissionReadings) => void;
};

export function createLocationPermissionObserver(
  deps: LocationPermissionObserverDeps,
) {
  let baseline: Baseline | null = null;
  let chain: Promise<void> = Promise.resolve();

  async function loadBaseline(): Promise<Baseline> {
    if (baseline) return baseline;
    let loaded: Baseline = {};
    try {
      const raw = deps.store
        ? await deps.store.getItem(LOCATION_PERMISSION_BASELINE_KEY)
        : null;
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') loaded = parsed as Baseline;
    } catch {
      // No baseline: the next observation stores one.
    }
    baseline = loaded;
    return loaded;
  }

  async function observeOnce(
    requested: LocationPermissionKind | null,
  ): Promise<void> {
    const readings = await deps.read();
    const current = await loadBaseline();
    let changed = false;
    for (const kind of KINDS) {
      const reading = readings[kind];
      const previous = current[kind];
      const wasRequested = requested === kind;
      const shouldEmit = previous
        ? previous.granted !== reading.granted ||
          (wasRequested && !previous.decided)
        : wasRequested;
      if (shouldEmit) deps.onChange(kind, reading.granted);
      // A later "active" reading must not consume the event of a pending request.
      const next = {
        granted: reading.granted,
        decided: previous
          ? previous.decided || wasRequested || shouldEmit
          : reading.decided || wasRequested,
      };
      if (previous?.granted !== next.granted || previous?.decided !== next.decided) {
        current[kind] = next;
        changed = true;
      }
    }
    deps.onState(readings);
    if (changed && deps.store) {
      await deps.store
        .setItem(LOCATION_PERMISSION_BASELINE_KEY, JSON.stringify(current))
        .catch(() => {});
    }
  }

  return {
    /** Serialized so two quick observations cannot report one change twice. */
    observe(requested: LocationPermissionKind | null = null): Promise<void> {
      chain = chain.catch(() => {}).then(() => observeOnce(requested));
      return chain.catch(() => {});
    },
  };
}
