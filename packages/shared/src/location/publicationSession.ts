/**
 * Publication session gate (Visibility runtime), isolated per uid + generation.
 *
 * Phases:
 * - 'unbound': this JS context never bound a session (headless background
 *   task after process death). Only the persisted runtime authorization
 *   (backgroundRuntimeAuth) applies.
 * - 'pending': signed in, Visibility not yet confirmed for this session.
 *   Runtime, Nearby search and background publication stay blocked until a
 *   confirmed activate/publish.
 * - 'open': activate/publish confirmed for `uid` at this generation.
 * - 'closed': logout in progress or signed out — nothing may publish.
 *
 * Every publish holds a ticket taken before it starts and re-checked before
 * the callable is sent and after it returns, so a late callback from a
 * previous session (or another uid) can never publish or count as success.
 * Logout never writes Visibility: presence expires server-side via the
 * confirmedAt TTL.
 */

export type PublicationSessionPhase = 'unbound' | 'pending' | 'open' | 'closed';

export type PublicationTicketPurpose = 'confirm' | 'runtime';

export type PublicationTicket = {
  uid: string;
  generation: number;
  purpose: PublicationTicketPurpose;
  /** Taken while the context was unbound (headless background task). */
  unbound?: boolean;
};

type Listener = () => void;

let phase: PublicationSessionPhase = 'unbound';
let sessionUid: string | null = null;
let generation = 0;
const inFlight = new Set<Promise<unknown>>();
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribePublicationSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPublicationSessionPhase(): PublicationSessionPhase {
  return phase;
}

export function getPublicationSessionGeneration(): number {
  return generation;
}

/**
 * Sign-in / session restore. A different uid (or a closed gate) starts a new
 * generation in 'pending'; re-binding the same live session is a no-op.
 */
export function bindPublicationSession(uid: string): void {
  if (!uid) return;
  if ((phase === 'pending' || phase === 'open') && sessionUid === uid) return;
  generation += 1;
  sessionUid = uid;
  phase = 'pending';
  notify();
}

/** Logout (before signOut) / signed out. Invalidates every ticket. */
export function closePublicationSession(): void {
  generation += 1;
  sessionUid = null;
  phase = 'closed';
  notify();
}

/** Runtime (FGS, Nearby search, cadence publish) allowed for this uid. */
export function isPublicationRuntimeOpen(uid: string | null | undefined): boolean {
  return Boolean(uid) && phase === 'open' && sessionUid === uid;
}

export function acquirePublicationTicket(
  authUid: string | null | undefined,
  purpose: PublicationTicketPurpose,
): PublicationTicket | null {
  if (!authUid || sessionUid !== authUid) return null;
  if (purpose === 'runtime' && phase !== 'open') return null;
  if (purpose === 'confirm' && phase !== 'pending' && phase !== 'open') {
    return null;
  }
  return { uid: authUid, generation, purpose };
}

/**
 * Background task ticket: a bound context requires an open session; an
 * unbound (headless) context defers to the persisted runtime authorization.
 */
export function acquireBackgroundPublicationTicket(
  authUid: string | null | undefined,
): PublicationTicket | null {
  if (!authUid) return null;
  if (phase === 'unbound') {
    return { uid: authUid, generation, purpose: 'runtime', unbound: true };
  }
  return acquirePublicationTicket(authUid, 'runtime');
}

export function isPublicationTicketCurrent(
  ticket: PublicationTicket | null | undefined,
  authUid: string | null | undefined,
): boolean {
  if (!ticket || !authUid || ticket.uid !== authUid) return false;
  if (ticket.generation !== generation) return false;
  if (ticket.unbound) return phase === 'unbound';
  if (sessionUid !== ticket.uid) return false;
  return ticket.purpose === 'runtime'
    ? phase === 'open'
    : phase === 'pending' || phase === 'open';
}

/** Confirmed activate/publish for the ticket's session → runtime may start. */
export function confirmPublicationSession(
  ticket: PublicationTicket | null | undefined,
): boolean {
  if (!ticket || ticket.unbound) return false;
  if (!isPublicationTicketCurrent(ticket, ticket.uid)) return false;
  if (phase !== 'open') {
    phase = 'open';
    notify();
  }
  return true;
}

export function trackPublication<T>(promise: Promise<T>): Promise<T> {
  inFlight.add(promise);
  const release = () => {
    inFlight.delete(promise);
  };
  promise.then(release, release);
  return promise;
}

export type PublicationSessionGuard = { isCurrent: () => boolean };

export type GuardedPublicationResult<T> =
  | { status: 'sent'; value: T }
  | { status: 'session-closed' }
  | { status: 'error'; error: unknown };

/**
 * Sends one publication under the session guard: never sent when the session
 * is already stale, tracked while in flight (logout drains it), and a reply
 * that lands after the session closed is reported as 'session-closed'.
 */
export async function sendGuardedPublication<T>(
  guard: PublicationSessionGuard | undefined,
  send: () => Promise<T>,
): Promise<GuardedPublicationResult<T>> {
  if (guard && !guard.isCurrent()) return { status: 'session-closed' };
  try {
    const value = await trackPublication((async () => send())());
    if (guard && !guard.isCurrent()) return { status: 'session-closed' };
    return { status: 'sent', value };
  } catch (error) {
    if (guard && !guard.isCurrent()) return { status: 'session-closed' };
    return { status: 'error', error };
  }
}

export function getInFlightPublicationCount(): number {
  return inFlight.size;
}

/** Wait (bounded) for publishes already sent before signOut. */
export async function drainInFlightPublications(
  timeoutMs = 4_000,
): Promise<'drained' | 'timeout'> {
  if (inFlight.size === 0) return 'drained';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const settled = Promise.allSettled([...inFlight]).then(
    () => 'drained' as const,
  );
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test helper */
export function resetPublicationSessionForTests(): void {
  phase = 'unbound';
  sessionUid = null;
  generation = 0;
  inFlight.clear();
  listeners.clear();
}
