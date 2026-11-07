/**
 * Small state machines that turn product signals into events. Pure, so the
 * rules can be tested without React Native.
 */
import type { LocationPermissionKind } from './ownExternalFlow.ts';

/**
 * Location permission. The first reading of a process is the baseline: it only
 * updates the person. After that, an event fires for a real change or for a
 * request that was answered with a denial. A request that finds the permission
 * already granted shows no dialog, so it is silent.
 */
export function createLocationPermissionObserver(deps: {
  emit: (
    kind: LocationPermissionKind,
    granted: boolean,
    trigger: 'request' | 'state_change',
  ) => void;
  setPerson: (kind: LocationPermissionKind, granted: boolean) => void;
}) {
  const last: Partial<Record<LocationPermissionKind, boolean>> = {};
  function record(kind: LocationPermissionKind, granted: boolean) {
    const previous = last[kind];
    last[kind] = granted;
    if (previous !== granted) deps.setPerson(kind, granted);
    return previous;
  }
  return {
    noteState(kind: LocationPermissionKind, granted: boolean): void {
      const previous = record(kind, granted);
      if (previous !== undefined && previous !== granted) {
        deps.emit(kind, granted, 'state_change');
      }
    },
    noteRequest(kind: LocationPermissionKind, granted: boolean): void {
      const previous = record(kind, granted);
      if (granted && previous === true) return;
      deps.emit(kind, granted, 'request');
    },
    /** Rewrites the person after an account change; reset clears nothing local. */
    replayPerson(): void {
      for (const kind of ['foreground', 'background'] as const) {
        const value = last[kind];
        if (value !== undefined) deps.setPerson(kind, value);
      }
    },
  };
}

/** One `visibility_changed` per real transition seen in this process. */
export function createVisibilityObserver(emit: (enabled: boolean) => void) {
  let last: boolean | undefined;
  return {
    note(enabled: boolean): void {
      if (last === enabled) return;
      last = enabled;
      emit(enabled);
    },
    forget(): void {
      last = undefined;
    },
  };
}

/**
 * `discovery_opened` for one screen entry: the first successful load, including
 * an empty result. An error is not a success, and later refreshes do not count.
 * The time is measured from the start of the attempt that succeeded.
 */
export function createDiscoveryEntryTracker(now: () => number) {
  let attemptStartedAt: number | null = null;
  let reported = false;
  return {
    noteAttemptStart(): void {
      if (!reported) attemptStartedAt = now();
    },
    noteSuccess(peopleShown: number): { load_time_sec: number; people_shown: number } | null {
      if (reported || attemptStartedAt === null) return null;
      reported = true;
      const elapsedMs = Math.max(0, now() - attemptStartedAt);
      return {
        load_time_sec: Math.round(elapsedMs / 100) / 10,
        people_shown: peopleShown,
      };
    },
  };
}
