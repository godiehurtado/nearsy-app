/**
 * Keeps a deleted account's analytics from reaching PostHog after the deletion.
 * Functions contract (ANALYTICS_DISTINCT_ID_CONTRACT.md §2-§3): the queue purge
 * covers the UID and the account's own distinct id.
 *
 * - hold:    the deletion request is about to run. New account events and person
 *            updates of that UID are dropped. Queued ones are paused in this
 *            process: a batch that holds them is not sent (the SDK keeps it).
 * - release: the backend rejected the request, or Auth confirmed the account
 *            still exists. Everything resumes, queued events included.
 * - confirm: the deletion is confirmed (or the person left the pending state).
 *            Queued events of those ids are dropped and never sent.
 *
 * Records are persisted, so a restart between the callable and the purge still
 * purges before anything is sent. After a restart every recorded id is dropped:
 * a request whose outcome was never settled is treated as a deletion, which can
 * lose a few events of an account that survived but never resends one that was
 * deleted. A record ends with release, with a new Auth session of the same UID
 * (a re-created account, or a sign-in that proves it exists), or after
 * RECORD_TTL_MS, so analytics is never blocked for good.
 *
 * What a request already sent cannot be taken back: an in-flight batch that
 * succeeds before the hold is delivered; one that fails and retries is held.
 *
 * Records hold the ids already present in the SDK's own queue files, in the same
 * app storage. Nothing here is logged.
 */

export const DELETION_GUARD_STORAGE_KEY = 'NEARSY_ANALYTICS_DELETION_GUARD';
export const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type DeliveryDecision = 'send' | 'drop' | 'defer';

/** Auth metadata strings as Firebase reports them; null when unreadable. */
export type AuthSessionMarks = { lastSignInTime: string | null; creationTime: string | null };

type DeletionRecord = {
  uid: string;
  ids: string[];
  state: 'held' | 'deleted';
  marks: AuthSessionMarks;
  at: number;
};

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function readMark(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Reads metadata that RNFirebase may throw on; never throws. */
export function readAuthSessionMarks(user: unknown): AuthSessionMarks {
  try {
    const metadata = (user as { metadata?: Record<string, unknown> } | null)?.metadata;
    return {
      lastSignInTime: readMark(metadata?.lastSignInTime),
      creationTime: readMark(metadata?.creationTime),
    };
  } catch {
    return { lastSignInTime: null, creationTime: null };
  }
}

function parseRecords(raw: string | null, now: number): DeletionRecord[] {
  if (!raw) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: DeletionRecord[] = [];
  for (const row of rows) {
    const r = row as Partial<DeletionRecord> | null;
    if (!r || typeof r.uid !== 'string' || !r.uid) continue;
    if (r.state !== 'held' && r.state !== 'deleted') continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at) || now - r.at > RECORD_TTL_MS) continue;
    const ids = Array.isArray(r.ids) ? r.ids.filter((id): id is string => typeof id === 'string' && !!id) : [];
    out.push({
      uid: r.uid,
      ids: [...new Set([r.uid, ...ids])],
      state: r.state,
      marks: {
        lastSignInTime: readMark(r.marks?.lastSignInTime),
        creationTime: readMark(r.marks?.creationTime),
      },
      at: r.at,
    });
  }
  return out;
}

/** A session other than the recorded one; unknown marks prove nothing. */
function isLaterSession(recorded: AuthSessionMarks, current: AuthSessionMarks): boolean {
  const differs = (a: string | null, b: string | null) => a !== null && b !== null && a !== b;
  return (
    differs(recorded.lastSignInTime, current.lastSignInTime) ||
    differs(recorded.creationTime, current.creationTime)
  );
}

export function createAnalyticsDeletionGuard(deps: { storage: Storage; now: () => number }) {
  const records = new Map<string, DeletionRecord>();
  /** UIDs held in this process: their queued events wait instead of being dropped. */
  const paused = new Set<string>();
  let version = 0;
  let loading: Promise<void> | null = null;
  let writes: Promise<void> = Promise.resolve();

  function persist(): Promise<void> {
    const snapshot = JSON.stringify([...records.values()]);
    const empty = records.size === 0;
    writes = writes
      .then(() =>
        empty
          ? deps.storage.removeItem(DELETION_GUARD_STORAGE_KEY)
          : deps.storage.setItem(DELETION_GUARD_STORAGE_KEY, snapshot),
      )
      .catch(() => {
        // The in-memory state still applies to this process.
      });
    return writes;
  }

  function bump() {
    version += 1;
  }

  return {
    /** Before the SDK sends anything. A failed read means no record. */
    load(): Promise<void> {
      loading ??= (async () => {
        let raw: string | null = null;
        try {
          raw = await deps.storage.getItem(DELETION_GUARD_STORAGE_KEY);
        } catch {
          raw = null;
        }
        for (const record of parseRecords(raw, deps.now())) {
          if (!records.has(record.uid)) records.set(record.uid, record);
        }
        bump();
      })();
      return loading;
    },

    decide(distinctId: unknown): DeliveryDecision {
      if (typeof distinctId !== 'string') return 'send';
      for (const record of records.values()) {
        if (!record.ids.includes(distinctId)) continue;
        return record.state === 'held' && paused.has(record.uid) ? 'defer' : 'drop';
      }
      return 'send';
    },

    /** Changes whenever a decision may have changed. */
    version: () => version,

    /** Account events and person updates of this UID are dropped. */
    isBlocked: (uid: string) => records.has(uid),

    /** Ids whose queued events must go. */
    droppedIds(): string[] {
      return [...records.values()]
        .filter((record) => !(record.state === 'held' && paused.has(record.uid)))
        .flatMap((record) => record.ids);
    },

    idsOf: (uid: string) => [...(records.get(uid)?.ids ?? [])],

    async hold(uid: string, ids: string[], marks: AuthSessionMarks): Promise<void> {
      const previous = records.get(uid);
      records.set(uid, {
        uid,
        ids: [...new Set([uid, ...(previous?.ids ?? []), ...ids])],
        state: 'held',
        marks,
        at: deps.now(),
      });
      paused.add(uid);
      bump();
      await persist();
    },

    async release(uid: string): Promise<void> {
      paused.delete(uid);
      if (!records.delete(uid)) return;
      bump();
      await persist();
    },

    /** Returns every id of the account, for the queue purge. */
    async confirm(uid: string, ids: string[], marks: AuthSessionMarks): Promise<string[]> {
      const previous = records.get(uid);
      const record: DeletionRecord = {
        uid,
        ids: [...new Set([uid, ...(previous?.ids ?? []), ...ids])],
        state: 'deleted',
        // The session that asked for the deletion; a later one ends the record.
        marks:
          previous && (previous.marks.lastSignInTime || previous.marks.creationTime)
            ? previous.marks
            : marks,
        at: deps.now(),
      };
      records.set(uid, record);
      paused.delete(uid);
      bump();
      await persist();
      return [...record.ids];
    },

    /**
     * A signed-in session of a recorded UID. A later Auth session ends the record:
     * the returned ids must be purged from the queue before this account is
     * identified. The same session (a restart while the outcome is unknown) keeps
     * it, so nothing is identified or sent.
     */
    async noteSession(uid: string, marks: AuthSessionMarks): Promise<
      { blocked: true } | { blocked: false; purge: string[] }
    > {
      const record = records.get(uid);
      if (!record) return { blocked: false, purge: [] };
      if (paused.has(uid) || !isLaterSession(record.marks, marks)) return { blocked: true };
      records.delete(uid);
      bump();
      await persist();
      return { blocked: false, purge: record.ids };
    },
  };
}

export type AnalyticsDeletionGuard = ReturnType<typeof createAnalyticsDeletionGuard>;
