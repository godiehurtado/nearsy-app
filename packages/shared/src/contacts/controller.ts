/**
 * Orchestrates Identity Contacts HMAC against the contract merged in Identity
 * #27. No productive calls from tests: inject a fake client.
 *
 * - The epoch comes from Identity: never assume 0 without local state.
 * - A cancelled operation (turned off, signed out) only raises the stored
 *   epoch: it never confirms a snapshot, restores consent or starts an upload.
 * - Reconciling never touches the OS permission or the address book.
 * - refreshVerifiedActorKeys has effects and a rate limit: at most one per
 *   reconcile, never in a loop.
 * - If reevaluate fails, the Identity write stays.
 */

import { currentIdentifierCap, noteServerIdentifierCap } from './identifierCap';
import {
  ContactsHmacClientError,
  isDefiniteContactsRejection,
  parseContactsHmacFailReason,
} from './errors';
import {
  claimSnapshotVersion,
  knownSnapshotVersionFor,
  observeContactsEpoch,
  retireSentVersion,
} from './contactsSessionState';
import {
  createSourceId,
  fingerprintIdentifiers,
  selectUploadableIdentifiers,
} from './identifiers';
import {
  buildDisableContactsSyncRequest,
  buildEnableContactsSyncRequest,
  buildRefreshVerifiedActorKeysRequest,
  buildRemoveContactSourceRequest,
  buildSyncContactHashesRequest,
  shouldCallReevaluateAfterIdentity,
} from './parse';
import type {
  ContactsAddressBookPort,
  ContactsHmacClient,
  ContactsSessionStore,
} from './port';
import type { ContactIdentifierInput } from './domain';
import type { CountryCode } from 'libphonenumber-js/max';
import { decideContactsPermissionAction } from './syncPolicy';
import type { ContactsWireResult } from './wireTypes';

export const CONTACTS_OP_SKIPPED_REASON = 'contacts-op-skipped';
/** A turn-off the server has not confirmed. Only an explicit retry resends it. */
export const CONTACTS_DISABLE_PENDING_REASON = 'contacts-disable-pending';

/** Bounded in-operation attempts for turning off; then the user can retry. */
export const CONTACTS_DISABLE_MAX_ATTEMPTS = 3;
const CONTACTS_DISABLE_BACKOFF_MS = 1_000;

/** Durable per-UID marker from contract §9. Survives a lost response. */
export type ContactsReevaluatePendingPort = {
  isPending(): Promise<boolean>;
  markPending(): Promise<void>;
  clear(): Promise<void>;
};

export type ContactsControllerPorts = {
  client: ContactsHmacClient;
  session: ContactsSessionStore;
  book: ContactsAddressBookPort;
  createRandomHex?: () => string;
  /**
   * Region for national numbers, from the account's OTP-verified phone only.
   * Null: no region, national numbers are skipped. A failed read fails the
   * sync instead of uploading a book read with a different rule.
   */
  readDefaultPhoneRegion?: () => Promise<CountryCode | null>;
  /** Asks for a reevaluate. The controller decides when one is owed. */
  afterIdentity?: (result: ContactsWireResult) => Promise<void>;
  reevaluatePending?: ContactsReevaluatePendingPort;
  /** True once this intent was superseded by a disable or a sign-out. */
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
};

export type ContactsControllerOutcome =
  | { ok: true; result: ContactsWireResult; bookSynced: boolean }
  | {
      ok: false;
      reason: string;
      bookSynced: false;
      /**
       * What Identity reported in this operation, when known: true keeps the
       * toggle on and offers a sync retry, false confirms it is off.
       */
      identityEnabled?: boolean;
      result?: ContactsWireResult;
    };

type ContactsFailure = Extract<ContactsControllerOutcome, { ok: false }>;

function failReason(err: unknown): string {
  return err instanceof ContactsHmacClientError
    ? err.reason
    : parseContactsHmacFailReason(err) ?? 'contacts-invalid-response';
}

function fail(reason: string, live?: ContactsWireResult): ContactsFailure {
  return live
    ? {
        ok: false,
        reason,
        bookSynced: false,
        identityEnabled: live.contactsSyncEnabled,
        result: live,
      }
    : { ok: false, reason, bookSynced: false };
}

const skipped = (): ContactsFailure => fail(CONTACTS_OP_SKIPPED_REASON);

const isCancelled = (ports: Pick<ContactsControllerPorts, 'isCancelled'>) =>
  ports.isCancelled?.() === true;

const isEpochRejection = (reason: string) =>
  reason === 'contacts-epoch-mismatch' || reason === 'contacts-epoch-required';

type CallPorts = Pick<
  ContactsControllerPorts,
  'session' | 'afterIdentity' | 'reevaluatePending'
>;

async function quietly<T>(work: Promise<T> | undefined): Promise<T | undefined> {
  try {
    return await work;
  } catch {
    return undefined;
  }
}

/**
 * Sends one Identity call with the contract §9 reevaluate rules. The marker is
 * written first, so an unanswered call leaves it set; a later "nothing changed"
 * response then cannot clear it, because it does not speak for the lost call.
 */
async function identityCall(
  ports: CallPorts,
  send: () => Promise<ContactsWireResult>,
): Promise<ContactsWireResult> {
  const pending = ports.reevaluatePending;
  const wasPending = (await quietly(pending?.isPending())) === true;
  await quietly(pending?.markPending());

  let result: ContactsWireResult;
  try {
    result = await send();
  } catch (err) {
    if (!wasPending && isDefiniteContactsRejection(failReason(err))) {
      await quietly(pending?.clear());
    }
    throw err;
  }

  noteServerIdentifierCap(result);
  await ports.session.update((current) =>
    observeContactsEpoch(current, result.contactsEpoch),
  );
  if (shouldCallReevaluateAfterIdentity(result) || wasPending) {
    await quietly(ports.afterIdentity?.(result));
  } else {
    await quietly(pending?.clear());
  }
  return result;
}

function refreshLiveState(
  ports: Pick<ContactsControllerPorts, 'client'> & CallPorts,
): Promise<ContactsWireResult> {
  return identityCall(ports, () =>
    ports.client.refreshVerifiedActorKeys(buildRefreshVerifiedActorKeysRequest()),
  );
}

async function setDisablePending(
  ports: Pick<ContactsControllerPorts, 'session'>,
  disablePending: boolean,
): Promise<void> {
  await ports.session.update((current) => ({
    sourceId: null,
    contactsEpoch: null,
    snapshotVersion: null,
    fingerprint: null,
    ...current,
    disablePending,
  }));
}

/**
 * Reads the state for an unresolved turn-off, once. Off completes it. On stays
 * pending: a later epoch may be a new activation from another device, so this
 * never sends a disable by itself.
 */
async function readPendingDisable(
  ports: ContactsControllerPorts,
): Promise<{ failure: ContactsFailure } | { live: ContactsWireResult | null }> {
  const session = await ports.session.load();
  if (!session?.disablePending) return { live: null };
  let live: ContactsWireResult;
  try {
    live = await refreshLiveState(ports);
  } catch {
    return { failure: fail(CONTACTS_DISABLE_PENDING_REASON) };
  }
  if (isCancelled(ports)) return { failure: skipped() };
  if (live.contactsSyncEnabled) {
    return { failure: fail(CONTACTS_DISABLE_PENDING_REASON, live) };
  }
  await setDisablePending(ports, false);
  return { live };
}

/** Recovers a turn-off left unfinished by an earlier run of the app. */
export async function reconcilePendingDisable(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  if (isCancelled(ports)) return skipped();
  const read = await readPendingDisable(ports);
  if ('failure' in read) return read.failure;
  return read.live
    ? { ok: true, result: read.live, bookSynced: false }
    : skipped();
}

type KnownEpoch = { epoch: number; live?: ContactsWireResult };

/** Stored epoch, or one refresh when this install has none (§14.1). */
async function resolveEpoch(ports: ContactsControllerPorts): Promise<KnownEpoch> {
  const session = await ports.session.load();
  if (session?.contactsEpoch != null) return { epoch: session.contactsEpoch };
  const live = await refreshLiveState(ports);
  return { epoch: live.contactsEpoch, live };
}

export async function enableAndSyncContacts(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  if (isCancelled(ports)) return skipped();
  const pendingDisable = await readPendingDisable(ports);
  if ('failure' in pendingDisable) return pendingDisable.failure;
  let permission = await ports.book.getPermission();
  if (decideContactsPermissionAction(permission) === 'request') {
    permission = await ports.book.requestPermission();
  }
  if (isCancelled(ports)) return skipped();
  if (decideContactsPermissionAction(permission) === 'remove-source') {
    const removed = await withdrawContactSource(ports);
    if (removed.ok === false) return removed;
    return fail('contacts-os-denied');
  }

  let enabled: ContactsWireResult;
  let refreshed = false;
  try {
    const known = await resolveEpoch(ports);
    refreshed = known.live != null;
    if (isCancelled(ports)) return skipped();
    enabled = await identityCall(ports, () =>
      ports.client.enableContactsSync(buildEnableContactsSyncRequest(known.epoch)),
    );
  } catch (err) {
    const reason = failReason(err);
    if (isCancelled(ports)) return skipped();
    if (!isEpochRejection(reason) || refreshed) return fail(reason);
    let live: ContactsWireResult;
    try {
      live = await refreshLiveState(ports);
    } catch (refreshErr) {
      return fail(failReason(refreshErr));
    }
    if (isCancelled(ports)) return skipped();
    // Off: never reactivated automatically. Turning on again is a new tap,
    // which now has the refreshed epoch. On: nothing to enable.
    if (!live.contactsSyncEnabled) return fail(reason, live);
    enabled = live;
  }

  const synced = await syncGrantedAddressBook(ports);
  if (synced.ok === false) {
    if (synced.reason === CONTACTS_OP_SKIPPED_REASON) return synced;
    return {
      ...synced,
      identityEnabled: synced.identityEnabled ?? enabled.contactsSyncEnabled === true,
      result: synced.result ?? enabled,
    };
  }
  return synced;
}

export async function syncGrantedAddressBook(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  if (isCancelled(ports)) return skipped();
  const pendingDisable = await readPendingDisable(ports);
  if ('failure' in pendingDisable) return pendingDisable.failure;
  if (pendingDisable.live) return fail('contacts-not-enabled', pendingDisable.live);
  const permission = await ports.book.getPermission();
  if (decideContactsPermissionAction(permission) !== 'sync') {
    return withdrawContactSource(ports);
  }
  if (isCancelled(ports)) return skipped();

  const defaultRegion = ports.readDefaultPhoneRegion
    ? await ports.readDefaultPhoneRegion()
    : null;
  if (isCancelled(ports)) return skipped();
  const rows = await ports.book.readRows();
  let limit = currentIdentifierCap();
  let selected = selectUploadableIdentifiers(rows, { defaultRegion, cap: limit.cap });
  if (
    selected.ok === false &&
    selected.reason === 'contacts-identifier-cap' &&
    !limit.serverAnswered
  ) {
    // No Identity answer yet in this process: learn the current limit once
    // before refusing, instead of assuming the old 500.
    await refreshLiveState(ports);
    if (isCancelled(ports)) return skipped();
    limit = currentIdentifierCap();
    selected = selectUploadableIdentifiers(rows, { defaultRegion, cap: limit.cap });
  }
  if (selected.ok === false) return fail(selected.reason);
  if (isCancelled(ports)) return skipped();

  return uploadSnapshot(ports, selected.identifiers);
}

async function uploadSnapshot(
  ports: ContactsControllerPorts,
  identifiers: ContactIdentifierInput[],
  reconciled = false,
): Promise<ContactsControllerOutcome> {
  let refreshedHere = reconciled;
  try {
    const known = await resolveEpoch(ports);
    if (known.live) {
      refreshedHere = true;
      // Never re-enables: with the integration off there is nothing to upload.
      if (!known.live.contactsSyncEnabled) {
        return fail('contacts-not-enabled', known.live);
      }
    }
    if (isCancelled(ports)) return skipped();

    const fingerprint = fingerprintIdentifiers(identifiers);
    const hex = ports.createRandomHex?.() ?? `${Date.now().toString(16)}aabbccdd`;
    const claimed = await ports.session.update((current) =>
      claimSnapshotVersion(observeContactsEpoch(current, known.epoch), {
        sourceId: createSourceId(hex),
        fingerprint,
      }),
    );
    const sent = claimed.sent!;
    const result = await identityCall(ports, () =>
      ports.client.syncContactHashes(
        buildSyncContactHashesRequest({
          sourceId: claimed.sourceId!,
          snapshotVersion: sent.version,
          contactsEpoch: sent.epoch,
          identifiers,
        }),
      ),
    );

    if (isCancelled(ports)) return skipped();
    const stored =
      result.syncCommitted === true &&
      (result.result === 'synced' || result.result === 'idempotent') &&
      result.contactsEpoch === sent.epoch;
    const after = await ports.session.update((current) => {
      const base = current ?? claimed;
      if (!stored || base.contactsEpoch !== sent.epoch) return base;
      return {
        ...base,
        snapshotVersion: Math.max(
          base.snapshotVersion ?? 0,
          result.snapshotVersion ?? sent.version,
        ),
        fingerprint,
      };
    });
    return {
      ok: true,
      result,
      // A confirmation from an older epoch says nothing: disable purged it.
      bookSynced: stored && after.contactsEpoch === sent.epoch,
    };
  } catch (err) {
    const reason = failReason(err);
    // An old answer cannot bring back an intent that was cancelled meanwhile.
    if (isCancelled(ports)) return skipped();
    if (reason === 'contacts-epoch-mismatch') {
      if (refreshedHere) return fail(reason);
      let live: ContactsWireResult;
      try {
        live = await refreshLiveState(ports);
      } catch (refreshErr) {
        return fail(failReason(refreshErr));
      }
      if (isCancelled(ports)) return skipped();
      if (!live.contactsSyncEnabled) return fail('contacts-not-enabled', live);
      // Uploading again needs the same intent still valid: no turn-off pending
      // and OS access still granted, read without prompting.
      const session = await ports.session.load();
      if (session?.disablePending) return fail(CONTACTS_DISABLE_PENDING_REASON, live);
      const permission = await ports.book.getPermission();
      if (decideContactsPermissionAction(permission) !== 'sync') {
        return fail('contacts-os-denied');
      }
      if (isCancelled(ports)) return skipped();
      return uploadSnapshot(ports, identifiers, true);
    }
    if (
      reason === 'contacts-snapshot-conflict' ||
      reason === 'contacts-snapshot-stale' ||
      reason === 'contacts-source-removed'
    ) {
      await ports.session.update((current) => retireSentVersion(current));
    }
    if (reason === 'contacts-not-enabled') {
      return { ...fail(reason), identityEnabled: false };
    }
    return fail(reason);
  }
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worth another attempt: a lost response (the retry then reads the barrier as
 * a mismatch) or a transient failure. A failed disable sets no barrier.
 */
function isTransientForDisable(reason: string): boolean {
  return (
    reason === 'contacts-invalid-response' ||
    reason === 'contacts-hmac-unavailable' ||
    reason === 'contacts-auth-lookup-failed' ||
    reason === 'contacts-timeout' ||
    // Only a refresh can answer this: disable itself is exempt from the limiter.
    reason === 'contacts-rate-limited'
  );
}

export async function disableContactsSyncFlow(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  const sleep = ports.sleep ?? sleepDefault;
  const done = async (result: ContactsWireResult): Promise<ContactsControllerOutcome> => {
    await ports.session.clearFingerprint();
    await setDisablePending(ports, false);
    return { ok: true, result, bookSynced: false };
  };

  // Written first, so closing the app cannot lose the user's turn-off.
  if (isCancelled(ports)) return skipped();
  await setDisablePending(ports, true);

  let reason = CONTACTS_DISABLE_PENDING_REASON;
  for (let attempt = 0; attempt < CONTACTS_DISABLE_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(CONTACTS_DISABLE_BACKOFF_MS * attempt);
    // A later disable or a sign-out owns this now.
    if (isCancelled(ports)) return skipped();
    try {
      const known = await resolveEpoch(ports);
      if (known.live && !known.live.contactsSyncEnabled) return done(known.live);
      const result = await identityCall(ports, () =>
        ports.client.disableContactsSync(
          buildDisableContactsSyncRequest(known.epoch),
        ),
      );
      return done(result);
    } catch (err) {
      reason = failReason(err);
      if (reason === 'contacts-epoch-mismatch') {
        // Also the retry of a lost disable: off confirms it. On at a later epoch
        // may be a new activation from another device, so it stays pending until
        // the user retries explicitly, now with the stored live epoch.
        try {
          const live = await refreshLiveState(ports);
          if (!live.contactsSyncEnabled) return done(live);
          return fail(CONTACTS_DISABLE_PENDING_REASON, live);
        } catch (refreshErr) {
          reason = failReason(refreshErr);
        }
      }
      if (!isTransientForDisable(reason)) return fail(reason);
    }
  }
  return fail(CONTACTS_DISABLE_PENDING_REASON);
}

export async function withdrawContactSource(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  let session = await ports.session.load();
  if (!session?.sourceId) return fail('contacts-os-denied');
  const sourceId = session.sourceId;

  let reconciled = false;
  let reissued = false;
  for (;;) {
    if (isCancelled(ports)) return skipped();
    try {
      const known = await resolveEpoch(ports);
      if (known.live) {
        reconciled = true;
        if (!known.live.contactsSyncEnabled) {
          return { ok: true, result: known.live, bookSynced: false };
        }
      }
      session = await ports.session.load();
      const result = await identityCall(ports, () =>
        ports.client.removeContactSource(
          buildRemoveContactSourceRequest({
            sourceId,
            contactsEpoch: known.epoch,
            knownSnapshotVersion: session
              ? knownSnapshotVersionFor(session, known.epoch)
              : 0,
          }),
        ),
      );
      // Removed, absent or superseded: the next upload needs a greater version.
      // `snapshotVersion` is the withdrawn or the stored one, so it counts.
      await ports.session.update((current) =>
        retireSentVersion(current, result.snapshotVersion),
      );
      if (result.result !== 'superseded') {
        return { ok: true, result, bookSynced: false };
      }

      // Not withdrawn: a newer snapshot is stored. Withdrawing again needs a
      // still-current intent, read here without asking for permission.
      if (isCancelled(ports)) return skipped();
      const permission = await ports.book.getPermission();
      if (decideContactsPermissionAction(permission) === 'sync') {
        return { ok: true, result, bookSynced: false };
      }
      if (reissued) return fail('contacts-os-denied', result);
      reissued = true;
    } catch (err) {
      const reason = failReason(err);
      if (reason !== 'contacts-epoch-mismatch' || reconciled) return fail(reason);
      try {
        const live = await refreshLiveState(ports);
        reconciled = true;
        // Off: disable already purged every source.
        if (!live.contactsSyncEnabled) {
          return { ok: true, result: live, bookSynced: false };
        }
      } catch (refreshErr) {
        return fail(failReason(refreshErr));
      }
    }
  }
}

export async function refreshVerifiedActorKeysFlow(
  ports: Pick<
    ContactsControllerPorts,
    'client' | 'afterIdentity' | 'session' | 'reevaluatePending'
  >,
): Promise<ContactsControllerOutcome> {
  try {
    const result = await refreshLiveState(ports);
    return { ok: true, result, bookSynced: false };
  } catch (err) {
    return fail(failReason(err));
  }
}
