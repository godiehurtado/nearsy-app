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
 *
 * Pure module.
 */
import type { StringStore } from './lifecycle';
import type { AnalyticsTransport } from './transport';

export const DELETION_RECORDS_KEY = 'nearsy.analytics.accountDeletions.v1';
const MAX_RECORDS = 20;

export type DeletionRecordState = 'intent' | 'confirmed';
export type DeletionRecord = { uid: string; atMs: number; state: DeletionRecordState };

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
    );
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
    record(uid: string, state: DeletionRecordState, atMs: number): Promise<void> {
      return serial(async () => {
        const records = await read();
        const existing = records.find((r) => r.uid === uid);
        if (existing?.state === 'confirmed' && state === 'intent') return;
        await write([...records.filter((r) => r.uid !== uid), { uid, atMs, state }]);
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
            removed += await transport.discardQueuedEventsFor(r.uid, r.atMs);
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
