/**
 * Default no-op. Android calls reevaluateProximityNotices (Auth + App Check,
 * caller uid only). Trailing 10s debounce matches the Functions lease.
 * UID/session changes cancel in-flight work from the previous session.
 * A burst keeps the trailing call so the last state is not dropped.
 */

export const REEVALUATE_DEBOUNCE_MS = 10_000;

export type ReevaluateDebouncer = {
  bindSession: (uid: string | null) => void;
  register: (invoke: (() => Promise<void>) | null) => void;
  schedule: () => void;
  flushNow: () => Promise<void>;
  isPending: () => boolean;
  resetForTests: () => void;
};

type TimerHandle = ReturnType<typeof setTimeout> | number;

export function createReevaluateDebouncer(opts?: {
  debounceMs?: number;
  scheduleTimer?: (fn: () => void, ms: number) => TimerHandle;
  cancelTimer?: (id: TimerHandle) => void;
}): ReevaluateDebouncer {
  const debounceMs = opts?.debounceMs ?? REEVALUATE_DEBOUNCE_MS;
  const scheduleTimer = opts?.scheduleTimer ?? setTimeout;
  const cancelTimer = (opts?.cancelTimer ?? clearTimeout) as (
    id: TimerHandle,
  ) => void;

  let session = 0;
  let uid: string | null = null;
  let invokeImpl: (() => Promise<void>) | null = null;
  let timer: TimerHandle | null = null;
  let pending = false;
  let inFlight = false;
  let inFlightSession = 0;

  function clearTimer() {
    if (timer != null) {
      cancelTimer(timer);
      timer = null;
    }
  }

  function bindSession(nextUid: string | null) {
    if (nextUid === uid) return;
    uid = nextUid;
    session += 1;
    pending = false;
    clearTimer();
  }

  function arm() {
    clearTimer();
    if (!invokeImpl || !uid) {
      pending = false;
      return;
    }
    const scheduledSession = session;
    timer = scheduleTimer(() => {
      timer = null;
      void run(scheduledSession);
    }, debounceMs);
  }

  async function run(forSession: number): Promise<void> {
    if (forSession !== session) return;
    if (!invokeImpl || !uid) {
      pending = false;
      return;
    }
    if (inFlight) {
      pending = true;
      return;
    }
    pending = false;
    inFlight = true;
    inFlightSession = forSession;
    try {
      await invokeImpl();
    } catch {
      /* Client must not treat Identity writes as failed. */
    } finally {
      inFlight = false;
      if (inFlightSession !== session) return;
      if (pending) arm();
    }
  }

  return {
    bindSession,
    register(invoke) {
      invokeImpl = invoke;
    },
    schedule() {
      if (!invokeImpl || !uid) return;
      pending = true;
      arm();
    },
    async flushNow() {
      clearTimer();
      await run(session);
    },
    isPending() {
      return pending || timer != null || inFlight;
    },
    resetForTests() {
      clearTimer();
      session = 0;
      uid = null;
      invokeImpl = null;
      pending = false;
      inFlight = false;
      inFlightSession = 0;
    },
  };
}

const singleton = createReevaluateDebouncer();

export function bindReevaluateSession(uid: string | null): void {
  singleton.bindSession(uid);
}

export function registerReevaluateProximityNoticesInvoker(
  invoke: (() => Promise<void>) | null,
): void {
  singleton.register(invoke);
}

export function scheduleReevaluateProximityNotices(): void {
  singleton.schedule();
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  await singleton.flushNow();
}

export function resetReevaluateProximityNoticesForTests(): void {
  singleton.resetForTests();
}
