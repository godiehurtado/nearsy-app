/**
 * Per-UID Contacts session rules (Identity contract §14). Pure TS: the iOS and
 * in-memory stores only supply read/write, so both enforce the same rules.
 *
 * - contactsEpoch is the highest epoch seen for this UID. `null` means unknown
 *   (new install, or signed out since): never assume 0, ask Identity.
 * - `fingerprint` confirms a snapshot only in the current epoch, because a
 *   disable purges sources.
 * - `sent` is the highest snapshot version sent in its epoch, confirmed or not,
 *   written before the request leaves. It is what remove fences.
 * - snapshotVersion never goes backwards for a stable sourceId.
 */

import { nextSnapshotVersion } from './identifiers';
import type { ContactsSessionSnapshot, ContactsSessionStore } from './port';

const EMPTY: ContactsSessionSnapshot = {
  sourceId: null,
  contactsEpoch: null,
  snapshotVersion: null,
  fingerprint: null,
  sent: null,
};

function maxVersion(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Raises the stored epoch. A lower epoch (late response) changes nothing. */
export function observeContactsEpoch(
  current: ContactsSessionSnapshot | null,
  epoch: number,
): ContactsSessionSnapshot {
  const base = current ?? EMPTY;
  if (base.contactsEpoch === epoch) return base;
  if (base.contactsEpoch != null && epoch < base.contactsEpoch) return base;
  const sentHere = base.sent?.epoch === epoch ? base.sent : null;
  return {
    ...base,
    contactsEpoch: epoch,
    // The counter keeps every version ever sent; confirmations do not survive.
    snapshotVersion: maxVersion(base.snapshotVersion, base.sent?.version ?? null),
    fingerprint: null,
    sent: sentHere,
  };
}

/** Highest version sent for this source in this epoch; 0 if none (§14.3). */
export function knownSnapshotVersionFor(
  session: ContactsSessionSnapshot,
  epoch: number,
): number {
  return session.sent?.epoch === epoch ? session.sent.version : 0;
}

/**
 * Records the version about to be sent. Same content as the last version in
 * this epoch reuses it (a retry after a lost response gets `idempotent`);
 * anything else takes a greater version, so an uncertain version is never
 * reused for different content.
 */
export function claimSnapshotVersion(
  current: ContactsSessionSnapshot,
  input: { sourceId: string; fingerprint: string },
): ContactsSessionSnapshot {
  const epoch = current.contactsEpoch;
  if (epoch == null) {
    throw new Error('contacts-epoch-unknown');
  }
  const sent = current.sent?.epoch === epoch ? current.sent : null;
  const lastVersion = maxVersion(current.snapshotVersion, sent?.version ?? null);
  const lastFingerprint = sent
    ? sent.version === lastVersion
      ? sent.fingerprint
      : null
    : current.fingerprint;
  const version = nextSnapshotVersion({
    lastVersion,
    lastFingerprint,
    nextFingerprint: input.fingerprint,
  });
  return {
    ...current,
    sourceId: current.sourceId ?? input.sourceId,
    sent: { epoch, version, fingerprint: input.fingerprint },
  };
}

/** The next upload must not reuse this version, whatever its content. */
export function retireSentVersion(
  current: ContactsSessionSnapshot | null,
  atLeast?: number | null,
): ContactsSessionSnapshot {
  const base = current ?? EMPTY;
  const epoch = base.contactsEpoch;
  const sentVersion = maxVersion(
    base.sent?.epoch === epoch ? base.sent!.version : null,
    atLeast ?? null,
  );
  return {
    ...base,
    snapshotVersion: maxVersion(base.snapshotVersion, sentVersion),
    fingerprint: null,
    sent:
      epoch != null && sentVersion != null
        ? { epoch, version: sentVersion, fingerprint: null }
        : base.sent,
  };
}

function normalize(
  previous: ContactsSessionSnapshot | null,
  next: ContactsSessionSnapshot,
): ContactsSessionSnapshot {
  if (!previous) return next;
  const sameSource =
    previous.sourceId != null && previous.sourceId === next.sourceId;
  const contactsEpoch =
    previous.contactsEpoch == null
      ? next.contactsEpoch
      : Math.max(previous.contactsEpoch, next.contactsEpoch ?? 0);
  return {
    ...next,
    contactsEpoch,
    snapshotVersion: sameSource
      ? maxVersion(previous.snapshotVersion, next.snapshotVersion)
      : next.snapshotVersion,
  };
}

export type ContactsSessionIO = {
  read(): Promise<ContactsSessionSnapshot | null>;
  write(snapshot: ContactsSessionSnapshot): Promise<void>;
};

const chains = new Map<string, Promise<unknown>>();

function enqueue<T>(lockKey: string, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(lockKey) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  chains.set(lockKey, tail);
  void tail.then(() => {
    if (chains.get(lockKey) === tail) chains.delete(lockKey);
  });
  return run;
}

/**
 * Every write is serialized per `lockKey`, because a cancelled operation may
 * still report its epoch while the disable that cancelled it is writing.
 */
export function createContactsSessionStoreFromIO(
  lockKey: string,
  io: ContactsSessionIO,
): ContactsSessionStore {
  const update: ContactsSessionStore['update'] = (mutate) =>
    enqueue(lockKey, async () => {
      const current = await io.read();
      const mutated = mutate(current);
      const next = normalize(current, mutated);
      await io.write(next);
      return next;
    });
  return {
    load: () => enqueue(lockKey, () => io.read()),
    update,
    save: async (snapshot) => {
      await update(() => ({ ...EMPTY, ...snapshot }));
    },
    clearFingerprint: async () => {
      await update((current) => ({ ...(current ?? EMPTY), fingerprint: null }));
    },
    forgetEpoch: () =>
      enqueue(lockKey, async () => {
        const current = await io.read();
        if (!current) return;
        await io.write({ ...current, contactsEpoch: null, fingerprint: null });
      }),
  };
}
