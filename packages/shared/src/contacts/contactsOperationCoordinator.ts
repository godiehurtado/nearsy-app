/**
 * Contacts operation coordination (iOS beta hardening).
 *
 * - One Identity operation at a time per UID: a retry while an operation is
 *   still running joins it instead of sending a parallel sync for the same
 *   sourceId (which would race snapshotVersion / epoch fences).
 * - A UI timeout never cancels the underlying request. The runner keeps the
 *   operation in flight until it settles; the late result is reported to the
 *   caller only while its generation is current.
 * - invalidate(uid) (logout, UID change, disable) makes late results stale
 *   and skips queued operations that have not started yet. Running ones see it
 *   through isCurrent and stop before their next step. It never sends anything
 *   to Identity and never re-enables consent.
 * - Disable does not wait for a running operation: turning off cannot depend
 *   on a slow enable. Identity serializes them, and both orders end off.
 *
 * Pure TS (no React Native imports) so behaviour is testable under tsx.
 */

import {
  CONTACTS_DISABLE_PENDING_REASON,
  CONTACTS_OP_SKIPPED_REASON,
  type ContactsControllerOutcome,
} from './controller';
import { isContactsCapExceeded, isContactsSyncRetryable } from './contactsErrorPresentation';
import { isDefiniteContactsRejection } from './errors';

export type ContactsOpKind = 'enable' | 'sync' | 'disable' | 'refresh';

export { CONTACTS_OP_SKIPPED_REASON };

export type ContactsOpTask = (context: {
  /** False once a disable or a sign-out superseded this intent. */
  isCurrent: () => boolean;
}) => Promise<ContactsControllerOutcome>;

export type ContactsOpToken = { uid: string; generation: number };

export type ContactsOpHandle = {
  token: ContactsOpToken;
  kind: ContactsOpKind;
  promise: Promise<ContactsControllerOutcome>;
  /** True when this call joined an operation that was already running. */
  joined: boolean;
};

type InFlight = {
  kind: ContactsOpKind;
  token: ContactsOpToken;
  promise: Promise<ContactsControllerOutcome>;
};

export type ContactsOperationRunner = {
  run(
    uid: string,
    kind: ContactsOpKind,
    task: ContactsOpTask,
  ): ContactsOpHandle;
  invalidate(uid: string): void;
  isCurrent(token: ContactsOpToken): boolean;
  inFlight(uid: string): ContactsOpKind | null;
};

function skipped(): ContactsControllerOutcome {
  return { ok: false, reason: CONTACTS_OP_SKIPPED_REASON, bookSynced: false };
}

export function createContactsOperationRunner(): ContactsOperationRunner {
  const generations = new Map<string, number>();
  const inflight = new Map<string, InFlight>();

  const generationOf = (uid: string) => generations.get(uid) ?? 0;

  const invalidate = (uid: string) => {
    generations.set(uid, generationOf(uid) + 1);
  };

  const isCurrent = (token: ContactsOpToken) =>
    generationOf(token.uid) === token.generation;

  const run: ContactsOperationRunner['run'] = (uid, kind, task) => {
    const current = inflight.get(uid);
    // Retry / double tap: never launch a second sync next to a running one.
    // enable already ends with a sync, so a retry joins it as well.
    const joinable =
      current != null &&
      kind !== 'disable' &&
      (kind === current.kind ||
        kind === 'refresh' ||
        (kind === 'sync' && current.kind === 'enable'));
    if (current && joinable) {
      return {
        token: current.token,
        kind: current.kind,
        promise: current.promise,
        joined: true,
      };
    }

    // Disable supersedes queued enable/sync work for this UID.
    if (kind === 'disable') invalidate(uid);
    const token: ContactsOpToken = { uid, generation: generationOf(uid) };

    const start = (): Promise<ContactsControllerOutcome> => {
      // Queued work whose generation was invalidated before it started
      // (logout / UID change / later disable) never reaches Identity.
      if (!isCurrent(token)) return Promise.resolve(skipped());
      return task({ isCurrent: () => isCurrent(token) });
    };
    // Nothing running, or a disable → start now (synchronously); otherwise
    // queue behind what is running.
    const promise =
      current && kind !== 'disable'
        ? current.promise.catch(() => undefined).then(start)
        : new Promise<ContactsControllerOutcome>((resolve) => resolve(start()));

    const entry: InFlight = { kind, token, promise };
    inflight.set(uid, entry);
    const clear = () => {
      if (inflight.get(uid) === entry) inflight.delete(uid);
    };
    promise.then(clear, clear);

    return { token, kind, promise, joined: false };
  };

  return {
    run,
    invalidate,
    isCurrent,
    inFlight: (uid) => inflight.get(uid)?.kind ?? null,
  };
}

/** Shared by More Settings and the App-level refreshVerifiedActorKeys invoker. */
export const contactsOperationRunner = createContactsOperationRunner();

export type BoundedWait<T> =
  | { settled: true; value: T }
  | { settled: true; error: unknown }
  | { settled: false };

/**
 * Bounded wait for the UI. Resolves `{ settled: false }` after `ms` without
 * cancelling `promise` — the caller keeps listening for the late result.
 */
export async function waitBounded<T>(
  promise: Promise<T>,
  ms: number,
): Promise<BoundedWait<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<BoundedWait<T>>([
      promise.then(
        (value) => ({ settled: true as const, value }),
        (error: unknown) => ({ settled: true as const, error }),
      ),
      new Promise<BoundedWait<T>>((resolve) => {
        timer = setTimeout(() => resolve({ settled: false }), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * - syncing: request sent, within the bounded UI wait.
 * - confirming: UI wait elapsed; server outcome unknown, still listening.
 * - synced: syncContactHashes committed this snapshot (bookSynced).
 * - enabledNotSynced: Identity has Contacts on, but no committed snapshot.
 * - error: last operation failed; see reason/retryable.
 */
export type ContactsSyncView =
  | 'idle'
  | 'syncing'
  | 'confirming'
  | 'synced'
  | 'enabledNotSynced'
  | 'error';

export type ContactsOutcomeView = {
  /** Confirmed server state, or null when only a server read can tell. */
  enabled: boolean | null;
  notifyNearbyContacts: boolean | null;
  view: ContactsSyncView;
  reason: string | null;
  retryable: boolean;
  /** What a user-initiated retry repeats. Null when there is nothing to retry. */
  retryKind: Exclude<ContactsOpKind, 'refresh'> | null;
};

const WITHDRAWN_RESULTS = new Set(['removed', 'absent']);

export function classifyContactsOutcome(
  kind: ContactsOpKind,
  outcome: ContactsControllerOutcome,
  previousEnabled: boolean,
): ContactsOutcomeView {
  if (outcome.ok) {
    const { result, bookSynced } = outcome;
    const enabled = result.contactsSyncEnabled === true;
    const notify = result.notifyNearbyContactsEffective === true;
    const quiet = {
      enabled,
      notifyNearbyContacts: notify,
      reason: null,
      retryable: false,
      retryKind: null,
    };
    if (kind === 'disable' || !enabled) return { ...quiet, view: 'idle' };
    if (bookSynced && result.syncCommitted === true) {
      return { ...quiet, view: 'synced' };
    }
    // Not withdrawn: a newer snapshot stays stored and the intent was stale.
    if (result.result === 'superseded') return { ...quiet, view: 'idle' };
    if (WITHDRAWN_RESULTS.has(result.result)) {
      // OS access withdrawn: source removed, Contacts stays on server-side.
      return {
        enabled,
        notifyNearbyContacts: notify,
        view: 'error',
        reason: 'contacts-os-denied',
        retryable: false,
        retryKind: null,
      };
    }
    return {
      enabled,
      notifyNearbyContacts: notify,
      view: 'enabledNotSynced',
      reason: null,
      retryable: true,
      retryKind: 'sync',
    };
  }

  // Narrowed above (the app tsconfig does not narrow on `if (outcome.ok)`).
  const failed = outcome as Extract<ContactsControllerOutcome, { ok: false }>;
  const { reason } = failed;
  if (reason === CONTACTS_OP_SKIPPED_REASON) {
    return { enabled: null, notifyNearbyContacts: null, view: 'idle', reason: null, retryable: false, retryKind: null };
  }
  if (reason === CONTACTS_DISABLE_PENDING_REASON) {
    // Never reported as off: only the server confirms that.
    return {
      enabled: failed.identityEnabled ?? null,
      notifyNearbyContacts: failed.result?.notifyNearbyContactsEffective ?? null,
      view: 'error',
      reason,
      retryable: true,
      retryKind: 'disable',
    };
  }
  const retryable = isContactsSyncRetryable(reason) && !isContactsCapExceeded(reason);
  const retryKind: ContactsOutcomeView['retryKind'] = !retryable
    ? null
    : failed.identityEnabled === true
      ? 'sync'
      : kind === 'refresh'
        ? null
        : kind;
  if (failed.identityEnabled === true) {
    return {
      enabled: true,
      notifyNearbyContacts: failed.result?.notifyNearbyContactsEffective ?? null,
      view: 'error',
      reason,
      retryable,
      retryKind,
    };
  }
  if (failed.identityEnabled === false || reason === 'contacts-not-enabled') {
    // Identity said it is off. Never turned back on without a new user action.
    return {
      enabled: false,
      notifyNearbyContacts: false,
      view: 'error',
      reason,
      retryable,
      retryKind,
    };
  }
  if (reason === 'contacts-os-denied' && kind === 'enable') {
    // enableContactsSync was never sent.
    return { enabled: previousEnabled, notifyNearbyContacts: null, view: 'error', reason, retryable: false, retryKind: null };
  }
  return {
    enabled: isDefiniteContactsRejection(reason) ? previousEnabled : null,
    notifyNearbyContacts: null,
    view: 'error',
    reason,
    retryable,
    retryKind,
  };
}

export type ContactsServerState = {
  enabled: boolean;
  notifyNearbyContacts: boolean;
};

export type DriveContactsOperationInput = {
  runner: ContactsOperationRunner;
  uid: string;
  kind: ContactsOpKind;
  task: ContactsOpTask;
  /** Last server-confirmed toggle value (before the user's tap). */
  previousEnabled: boolean;
  waitMs: number;
  /** Screen-level liveness (mounted, same signed-in UID). */
  isActive: () => boolean;
  /** Read-only server state (users/{uid}, Identity-owned fields). */
  readServerState: () => Promise<ContactsServerState | null>;
  onView: (view: ContactsOutcomeView) => void;
};

/**
 * Runs (or joins) one Contacts operation, reports `syncing`, then either the
 * result within `waitMs`, or `confirming` followed by the late result. When the
 * outcome does not prove the server state, reconciles via `readServerState`
 * instead of guessing ON/OFF. Late results for an invalidated generation or an
 * inactive screen are dropped.
 */
export async function driveContactsOperation(
  input: DriveContactsOperationInput,
): Promise<void> {
  const handle = input.runner.run(input.uid, input.kind, input.task);
  const live = () => input.runner.isCurrent(handle.token) && input.isActive();
  const pending = (view: ContactsSyncView): ContactsOutcomeView => ({
    enabled: null,
    notifyNearbyContacts: null,
    view,
    reason: null,
    retryable: false,
    retryKind: null,
  });

  input.onView(pending('syncing'));
  let settled = await waitBounded(handle.promise, input.waitMs);
  if (!settled.settled) {
    if (live()) input.onView(pending('confirming'));
    // Keep listening: callables are bounded by the HTTP layer timeout.
    settled = await handle.promise.then(
      (value): BoundedWait<ContactsControllerOutcome> => ({ settled: true, value }),
      (error: unknown): BoundedWait<ContactsControllerOutcome> => ({ settled: true, error }),
    );
  }
  if (!settled.settled || !live()) return;

  let view: ContactsOutcomeView =
    'value' in settled
      ? classifyContactsOutcome(handle.kind, settled.value, input.previousEnabled)
      : {
          enabled: null,
          notifyNearbyContacts: null,
          view: 'error',
          reason: 'contacts-invalid-response',
          retryable: true,
          retryKind: handle.kind === 'refresh' ? null : handle.kind,
        };

  if (view.enabled === null && view.view !== 'idle') {
    let server: ContactsServerState | null = null;
    try {
      server = await input.readServerState();
    } catch {
      server = null;
    }
    if (!live()) return;
    if (server) {
      // Reads off after a turn-off whose response was lost: that is the goal.
      view =
        handle.kind === 'disable' && !server.enabled
          ? {
              enabled: false,
              notifyNearbyContacts: false,
              view: 'idle',
              reason: null,
              retryable: false,
              retryKind: null,
            }
          : {
              ...view,
              enabled: server.enabled,
              notifyNearbyContacts: server.notifyNearbyContacts,
            };
    }
  }
  input.onView(view);
}
