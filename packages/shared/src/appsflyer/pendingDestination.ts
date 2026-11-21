/**
 * Pending OneLink navigation destination (contract nc1, C6). Separate from
 * attribution: consuming or dropping a destination never changes attribution.
 *
 * Stores only the closed-list key, whether it was deferred, when it was captured
 * and the account it was captured with. Never the URL.
 *
 * Rules:
 * - one destination at a time, the last one wins;
 * - TTL: direct 30 min, deferred 24 h;
 * - consumed once, only by a signed-in account that reached MainTabs (after the CRJ);
 * - the same key consumed in the last 10 min is not consumed again (direct + deferred);
 * - captured with account A → discarded when B is signed in;
 * - captured signed out → bound to the first account that signs in;
 * - cleared on sign-out.
 * Pure module: storage and clock are injected.
 */
import type { StringStore } from '../analytics/lifecycle';
import type { OneLinkDestination } from './oneLinkContract';
import { ONELINK_DESTINATIONS } from './oneLinkContract';

export const PENDING_DESTINATION_KEY = 'nearsy.onelink.pendingDestination.v1';
export const DIRECT_DESTINATION_TTL_MS = 30 * 60 * 1000;
export const DEFERRED_DESTINATION_TTL_MS = 24 * 60 * 60 * 1000;
export const DESTINATION_DEDUPE_MS = 10 * 60 * 1000;

type Pending = {
  key: OneLinkDestination;
  deferred: boolean;
  capturedAtMs: number;
  uid: string | null;
};

type Persisted = { pending: Pending | null; lastConsumed: { key: string; atMs: number } | null };

function isDestination(value: unknown): value is OneLinkDestination {
  return typeof value === 'string' && (ONELINK_DESTINATIONS as readonly string[]).includes(value);
}

function sanitize(raw: unknown): Persisted {
  const empty: Persisted = { pending: null, lastConsumed: null };
  if (!raw || typeof raw !== 'object') return empty;
  const value = raw as Partial<Persisted>;
  const p = value.pending as Partial<Pending> | null | undefined;
  const pending =
    p &&
    isDestination(p.key) &&
    typeof p.deferred === 'boolean' &&
    typeof p.capturedAtMs === 'number' &&
    (p.uid === null || typeof p.uid === 'string')
      ? { key: p.key, deferred: p.deferred, capturedAtMs: p.capturedAtMs, uid: p.uid }
      : null;
  const c = value.lastConsumed as { key?: unknown; atMs?: unknown } | null | undefined;
  const lastConsumed =
    c && typeof c.key === 'string' && typeof c.atMs === 'number'
      ? { key: c.key, atMs: c.atMs }
      : null;
  return { pending, lastConsumed };
}

export function createPendingDestinationStore(store: StringStore | null, now: () => number) {
  let memory: Persisted | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.catch(() => {}).then(fn);
    chain = next;
    return next;
  }

  async function load(): Promise<Persisted> {
    if (memory) return memory;
    try {
      const raw = store ? await store.getItem(PENDING_DESTINATION_KEY) : null;
      memory = sanitize(raw ? JSON.parse(raw) : null);
    } catch {
      memory = { pending: null, lastConsumed: null };
    }
    return memory;
  }

  async function save(next: Persisted): Promise<void> {
    memory = next;
    await store?.setItem(PENDING_DESTINATION_KEY, JSON.stringify(next)).catch(() => {});
  }

  function expired(p: Pending, at: number): boolean {
    const ttl = p.deferred ? DEFERRED_DESTINATION_TTL_MS : DIRECT_DESTINATION_TTL_MS;
    return at - p.capturedAtMs > ttl || at < p.capturedAtMs;
  }

  return {
    capture: (input: { key: OneLinkDestination; deferred: boolean; uid: string | null }) =>
      serial(async () => {
        const state = await load();
        await save({
          ...state,
          pending: { key: input.key, deferred: input.deferred, capturedAtMs: now(), uid: input.uid },
        });
      }),

    /** Sign-out clears it. */
    clear: () =>
      serial(async () => {
        const state = await load();
        if (state.pending) await save({ ...state, pending: null });
      }),

    /**
     * Returns the key to open, at most once. `uid` is the signed-in account that
     * is already in MainTabs.
     */
    take: (uid: string): Promise<OneLinkDestination | null> =>
      serial(async () => {
        const state = await load();
        const p = state.pending;
        if (!p) return null;
        const at = now();
        if (expired(p, at) || (p.uid !== null && p.uid !== uid)) {
          await save({ ...state, pending: null });
          return null;
        }
        const recent =
          state.lastConsumed &&
          state.lastConsumed.key === p.key &&
          at - state.lastConsumed.atMs <= DESTINATION_DEDUPE_MS;
        await save({ pending: null, lastConsumed: recent ? state.lastConsumed : { key: p.key, atMs: at } });
        return recent ? null : p.key;
      }),

    /** Signed in but not yet in MainTabs: bind or discard without consuming. */
    noteAccount: (uid: string) =>
      serial(async () => {
        const state = await load();
        const p = state.pending;
        if (!p) return;
        if (expired(p, now()) || (p.uid !== null && p.uid !== uid)) {
          await save({ ...state, pending: null });
        } else if (p.uid === null) {
          await save({ ...state, pending: { ...p, uid } });
        }
      }),
  };
}

export type PendingDestinationStore = ReturnType<typeof createPendingDestinationStore>;
