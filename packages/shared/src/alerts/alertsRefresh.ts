/**
 * One shared alerts fetch for the bell badge and the inbox (QA 2.1.0).
 *
 * Triggers: a proximity push received in the foreground, the app returning to
 * the foreground, the Alerts tab gaining focus, and the periodic fallback.
 * Triggers that arrive together are grouped into one discoverNearby call; a
 * trigger during a fetch runs once more after it, never in parallel.
 *
 * Note: alertPresence is written by the viewer's own discoverNearby call, so
 * it cannot signal a new alert earlier (Functions, 2026-11-16).
 *
 * Pure apart from the in-memory listener set.
 */

export type AlertsRefreshReason = 'push' | 'foreground' | 'focus' | 'interval';

type Listener = (reason: AlertsRefreshReason) => void;
const listeners = new Set<Listener>();

export function subscribeAlertsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ask the shared alerts state to refetch (no-op when nobody is mounted). */
export function requestAlertsRefresh(reason: AlertsRefreshReason): void {
  for (const listener of [...listeners]) {
    try {
      listener(reason);
    } catch {
      // One listener never blocks the others.
    }
  }
}

/** Groups triggers fired within this window into a single fetch. */
export const ALERTS_REFRESH_COALESCE_MS = 400;

export type RefreshCoalescerDeps = {
  schedule: (delayMs: number, run: () => void) => unknown;
  /** Performs one fetch; resolves when it is done (success or not). */
  run: () => Promise<void>;
  coalesceMs?: number;
};

export function createRefreshCoalescer(deps: RefreshCoalescerDeps) {
  const windowMs = deps.coalesceMs ?? ALERTS_REFRESH_COALESCE_MS;
  let scheduled = false;
  let running = false;
  let again = false;
  let disposed = false;

  async function fire(): Promise<void> {
    scheduled = false;
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await deps.run();
    } catch {
      // The caller handles its own errors; the coalescer keeps going.
    } finally {
      running = false;
      if (again && !disposed) {
        again = false;
        request();
      }
    }
  }

  function request(): void {
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    deps.schedule(windowMs, () => {
      void fire();
    });
  }

  return {
    request,
    dispose(): void {
      disposed = true;
    },
    isRunning: () => running,
  };
}

