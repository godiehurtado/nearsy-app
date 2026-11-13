/**
 * Durable trace of account deletion for the SDK queue, kept beside it in local
 * storage. On the next start, before any event is sent, queued events of each
 * recorded account up to the recorded time are removed, then the records go.
 *
 * - intent: a deletion was requested and its outcome is unknown. If the app dies
 *   meanwhile, its earlier events are removed: a few are lost rather than risk
 *   sending those of a deleted account. A cancelled request removes the record.
 * - confirmed: the deletion closed the account. This repeats the live discard in
 *   case the app died before it reached disk.
 *
 * The time bound keeps a recreated account with the same UID untouched.
 * Each record also names the account's other analytics ids (for a LinkedIn
 * account after the cutover, its nag1_ id), purged with the same bound.
 *
 * Pure module.
 */
import type { StringStore } from './lifecycle';
import type { AnalyticsTransport } from './transport';

export const DELETION_RECORDS_KEY = 'nearsy.analytics.accountDeletions.v1';
const MAX_RECORDS = 20;

export type DeletionRecordState = 'intent' | 'confirmed';
export type DeletionRecord = {
  uid: string;
  atMs: number;
  state: DeletionRecordState;
  /** distinct_ids besides the UID; absent on records written before proposal G. */
  ids?: string[];
};

function cleanIds(ids: unknown, uid: string): string[] {
  if (!Array.isArray(ids)) return [];
  const valid = ids.filter(
    (id): id is string => typeof id === 'string' && id.length > 0 && id !== uid,
  );
  return [...new Set(valid)];
}

function toRecord(uid: string, atMs: number, state: DeletionRecordState, ids: string[]): DeletionRecord {
  return ids.length > 0 ? { uid, atMs, state, ids } : { uid, atMs, state };
}

function parse(raw: string | null): DeletionRecord[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value.filter(
      (r): r is DeletionRecord =>
        !!r &&
        typeof r.uid === 'string' &&
        r.uid.length > 0 &&
        typeof r.atMs === 'number' &&
        Number.isFinite(r.atMs) &&
        (r.state === 'intent' || r.state === 'confirmed'),
    ).map((r) => toRecord(r.uid, r.atMs, r.state, cleanIds(r.ids, r.uid)));
  } catch {
    return [];
  }
}

export function createDeletionRecords(store: StringStore) {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.catch(() => {}).then(fn);
    chain = next;
    return next;
  };
  const read = async () => parse(await store.getItem(DELETION_RECORDS_KEY));
  const write = (records: DeletionRecord[]) =>
    store.setItem(DELETION_RECORDS_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));

  return {
    /** A confirmed record is never downgraded to intent. */
    record(
      uid: string,
      state: DeletionRecordState,
      atMs: number,
      distinctIds: readonly string[] = [],
    ): Promise<void> {
      return serial(async () => {
        const records = await read();
        const existing = records.find((r) => r.uid === uid);
        if (existing?.state === 'confirmed' && state === 'intent') return;
        const ids = cleanIds([...(existing?.ids ?? []), ...distinctIds], uid);
        await write([...records.filter((r) => r.uid !== uid), toRecord(uid, atMs, state, ids)]);
      });
    },
    /** Cancelled request. A confirmed record stays. */
    cancelIntent(uid: string): Promise<void> {
      return serial(async () => {
        const records = await read();
        const next = records.filter((r) => !(r.uid === uid && r.state === 'intent'));
        if (next.length !== records.length) await write(next);
      });
    },
    /** Runs before the transport serves any operation. Never throws. */
    purgeQueued(transport: AnalyticsTransport): Promise<number> {
      return serial(async () => {
        let removed = 0;
        try {
          const records = await read();
          for (const r of records) {
            for (const id of [r.uid, ...(r.ids ?? [])]) {
              removed += await transport.discardQueuedEventsFor(id, r.atMs);
            }
          }
          if (records.length > 0) await store.removeItem(DELETION_RECORDS_KEY);
        } catch {
          // Records stay for the next start.
        }
        return removed;
      });
    },
  };
}

export type DeletionRecords = ReturnType<typeof createDeletionRecords>;
