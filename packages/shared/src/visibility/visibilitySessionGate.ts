/**
 * Session barrier for presence-renewing callables (activateVisibility,
 * publishLocation).
 *
 * Presence derives from the server `confirmedAt`, so a publication that lands
 * after logout would keep a signed-out account discoverable. Logout closes the
 * gate first; only a new authenticated session reopens it for its UID.
 *
 * - Every attempt captures a ticket (generation) when it starts and is
 *   re-checked right before the request is sent.
 * - Closing or switching UID bumps the generation: tickets from the previous
 *   session can never send.
 * - Requests already sent are tracked so logout can wait for them (bounded).
 * - Process start (never opened/closed) allows sends; the callable still
 *   requires a signed-in Firebase user.
 */

import { VISIBILITY_CALLABLE_NAMES } from './callables/names';

export const VISIBILITY_LOGOUT_STEP_TIMEOUT_MS = 4_000;

export type VisibilitySessionTicket = { readonly generation: number };

type GateState = {
  closed: boolean;
  uid: string | null;
  generation: number;
};

let state: GateState = { closed: false, uid: null, generation: 0 };
const inFlight = new Set<Promise<unknown>>();

function normalizeUid(uid: string | null | undefined): string | null {
  const trimmed = String(uid ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Authenticated session for `uid` started (AppNavigator auth listener). */
export function openVisibilitySessionGate(uid: string | null | undefined): void {
  const id = normalizeUid(uid);
  if (!id) return;
  const newSession = state.closed || (state.uid !== null && state.uid !== id);
  state = {
    closed: false,
    uid: id,
    generation: newSession ? state.generation + 1 : state.generation,
  };
}

/** Logout started or Auth reported no user: no presence renewal may be sent. */
export function closeVisibilitySessionGate(): void {
  state = { closed: true, uid: null, generation: state.generation + 1 };
}

export function isVisibilitySessionGateClosed(): boolean {
  return state.closed;
}

export function captureVisibilitySessionTicket(): VisibilitySessionTicket | null {
  if (state.closed) return null;
  return { generation: state.generation };
}

/** Ticket still belongs to the open session (and to `uid` when given). */
export function isVisibilitySessionTicketCurrent(
  ticket: VisibilitySessionTicket | null,
  uid?: string | null,
): boolean {
  if (!ticket || state.closed) return false;
  if (ticket.generation !== state.generation) return false;
  const id = normalizeUid(uid);
  return id === null || state.uid === null || state.uid === id;
}

export function isPresenceRenewingCallable(name: string): boolean {
  return (
    name === VISIBILITY_CALLABLE_NAMES.publishLocation ||
    name === VISIBILITY_CALLABLE_NAMES.activateVisibility
  );
}

export function createVisibilitySessionClosedError(): {
  code: 'functions/unauthenticated';
  message: string;
} {
  return {
    code: 'functions/unauthenticated',
    message: 'Visibility session closed.',
  };
}

export function trackVisibilitySessionRequest<T>(request: Promise<T>): Promise<T> {
  const tracked = request.finally(() => {
    inFlight.delete(tracked);
  });
  inFlight.add(tracked);
  // Callers observe `request`; the tracked copy must not raise unhandled rejections.
  tracked.catch(() => {});
  return request;
}

export function countInFlightVisibilitySessionRequests(): number {
  return inFlight.size;
}

/**
 * Sends only while `ticket` is current; the send is tracked for logout.
 * Rejections from `send` propagate to the caller.
 */
export async function guardPresenceRenewal<T>(
  ticket: VisibilitySessionTicket | null,
  send: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'session_closed' }> {
  if (!isVisibilitySessionTicketCurrent(ticket)) {
    return { ok: false, reason: 'session_closed' };
  }
  const value = await trackVisibilitySessionRequest(send());
  return { ok: true, value };
}

type StepResult = 'done' | 'failed' | 'timeout';

async function runWithTimeout(
  task: () => Promise<unknown>,
  timeoutMs: number,
): Promise<StepResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<StepResult>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const run = (async (): Promise<StepResult> => {
    try {
      await task();
      return 'done';
    } catch {
      return 'failed';
    }
  })();
  try {
    return await Promise.race([run, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type VisibilityLogoutCloseResult = {
  runtimeStop: StepResult;
  inFlight: 'settled' | 'timeout';
};

/**
 * Logout barrier, before signOut:
 * 1) close the gate (no new presence renewal can be sent),
 * 2) stop/unregister the background runtime (bounded),
 * 3) wait for already-sent renewals to settle (bounded).
 * Never throws and never blocks signOut longer than 2 × timeoutMs.
 */
export async function closeVisibilitySessionForLogout(input: {
  stopRuntime: () => Promise<unknown>;
  timeoutMs?: number;
}): Promise<VisibilityLogoutCloseResult> {
  const timeoutMs = input.timeoutMs ?? VISIBILITY_LOGOUT_STEP_TIMEOUT_MS;
  closeVisibilitySessionGate();
  const runtimeStop = await runWithTimeout(input.stopRuntime, timeoutMs);
  const pending = [...inFlight];
  const settled =
    pending.length === 0
      ? 'done'
      : await runWithTimeout(() => Promise.allSettled(pending), timeoutMs);
  const result: VisibilityLogoutCloseResult = {
    runtimeStop,
    inFlight: settled === 'timeout' ? 'timeout' : 'settled',
  };
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[visibilitySessionGate] logout_closed', result);
  }
  return result;
}

export function resetVisibilitySessionGateForTests(): void {
  state = { closed: false, uid: null, generation: 0 };
  inFlight.clear();
}
