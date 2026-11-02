/**
 * Default no-op. Android calls reevaluateProximityNotices (Auth + App Check,
 * caller uid only). Trailing 10s debounce matches the Functions lease.
 * UID/session changes cancel in-flight work from the previous session.
 * A burst keeps the trailing call so the last state is not dropped.
 *
 * Durable pending (per UID) is optional: Identity sync stays committed even if
 * Functions reevaluate fails; the client retries reevaluate only.
 */

export const REEVALUATE_DEBOUNCE_MS = 10_000;

export type PendingReevaluateHooks = {
  mark?: (uid: string) => void | Promise<void>;
  clear?: (uid: string) => void | Promise<void>;
  isPending?: (uid: string) => boolean | Promise<boolean>;
};

export type ReevaluateDebouncer = {
  bindSession: (uid: string | null) => void;
  register: (invoke: (() => Promise<void>) | null) => void;
  setPendingHooks: (hooks: PendingReevaluateHooks | null) => void;
  schedule: () => void;
  flushNow: () => Promise<void>;
  resumePendingIfNeeded: () => Promise<void>;
  isPending: () => boolean;
  currentUid: () => string | null;
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
  let pendingHooks: PendingReevaluateHooks | null = null;
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
    // Cancel previous account's in-memory work; durable flags stay isolated by UID.
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
    const forUid = uid;
    if (!invokeImpl || !forUid) {
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
      if (forSession === session && uid === forUid) {
        await pendingHooks?.clear?.(forUid);
      }
    } catch {
      /* Keep durable pending; Identity write is already committed. */
      if (forSession === session && uid === forUid) {
        pending = true;
        await pendingHooks?.mark?.(forUid);
      }
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
    setPendingHooks(hooks) {
      pendingHooks = hooks;
    },
    schedule() {
      if (!invokeImpl || !uid) return;
      pending = true;
      void pendingHooks?.mark?.(uid);
      arm();
    },
    async flushNow() {
      clearTimer();
      await run(session);
    },
    async resumePendingIfNeeded() {
      if (!invokeImpl || !uid) return;
      const owed = await pendingHooks?.isPending?.(uid);
      if (owed) {
        pending = true;
        arm();
      }
    },
    isPending() {
      return pending || timer != null || inFlight;
    },
    currentUid() {
      return uid;
    },
    resetForTests() {
      clearTimer();
      session = 0;
      uid = null;
      invokeImpl = null;
      pendingHooks = null;
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

export function setReevaluatePendingHooks(
  hooks: PendingReevaluateHooks | null,
): void {
  singleton.setPendingHooks(hooks);
}

export function scheduleReevaluateProximityNotices(): void {
  singleton.schedule();
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  await singleton.flushNow();
}

export async function resumePendingReevaluateIfNeeded(): Promise<void> {
  await singleton.resumePendingIfNeeded();
}

export function resetReevaluateProximityNoticesForTests(): void {
  singleton.resetForTests();
}

export function getReevaluateDebouncerForTests(): ReevaluateDebouncer {
  return singleton;
}
