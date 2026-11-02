/**
 * Orchestrates Identity Contacts HMAC. No productive calls from tests —
 * inject a fake client. After syncCommitted && reevaluateRequired, the
 * caller invokes Functions reevaluateProximityNotices. If that fails,
 * the Identity write stays.
 */

import {
  ContactsHmacClientError,
  parseContactsHmacFailReason,
} from './errors';
import {
  createSourceId,
  fingerprintIdentifiers,
  nextSnapshotVersion,
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
import { decideContactsPermissionAction } from './syncPolicy';
import type { ContactsWireResult } from './wireTypes';

export type ContactsControllerPorts = {
  client: ContactsHmacClient;
  session: ContactsSessionStore;
  book: ContactsAddressBookPort;
  createRandomHex?: () => string;
  afterIdentity?: (result: ContactsWireResult) => Promise<void>;
};

export type ContactsControllerOutcome =
  | { ok: true; result: ContactsWireResult; bookSynced: boolean }
  | {
      ok: false;
      reason: string;
      bookSynced: false;
      /**
       * When Identity enable already committed but address-book sync failed,
       * keep the toggle on and offer retry instead of pretending enable rolled back.
       */
      identityEnabled?: boolean;
      result?: ContactsWireResult;
    };

async function persistSession(
  ports: ContactsControllerPorts,
  result: ContactsWireResult,
  extras?: { snapshotVersion?: number | null; fingerprint?: string | null },
): Promise<void> {
  const current = await ports.session.load();
  const sourceId = result.sourceId ?? current?.sourceId;
  if (!sourceId) return;
  await ports.session.save({
    sourceId,
    contactsEpoch: result.contactsEpoch,
    snapshotVersion:
      extras && Object.prototype.hasOwnProperty.call(extras, 'snapshotVersion')
        ? extras.snapshotVersion ?? null
        : result.snapshotVersion ?? current?.snapshotVersion ?? null,
    fingerprint:
      extras && Object.prototype.hasOwnProperty.call(extras, 'fingerprint')
        ? extras.fingerprint ?? null
        : current?.fingerprint ?? null,
  });
}

async function notifyAfterIdentity(
  ports: Pick<ContactsControllerPorts, 'afterIdentity'>,
  result: ContactsWireResult,
): Promise<void> {
  if (!shouldCallReevaluateAfterIdentity(result)) return;
  try {
    await ports.afterIdentity?.(result);
  } catch {
    /* Identity write stays. Do not retry the Identity body. */
  }
}

async function ensureSourceId(ports: ContactsControllerPorts): Promise<string> {
  const current = await ports.session.load();
  if (current?.sourceId) return current.sourceId;
  const hex = ports.createRandomHex?.() ?? `${Date.now().toString(16)}aabbccdd`;
  const sourceId = createSourceId(hex);
  await ports.session.save({
    sourceId,
    contactsEpoch: current?.contactsEpoch ?? 0,
    snapshotVersion: null,
    fingerprint: null,
  });
  return sourceId;
}

export async function enableAndSyncContacts(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  let permission = await ports.book.getPermission();
  const action = decideContactsPermissionAction(permission);
  if (action === 'request') {
    permission = await ports.book.requestPermission();
  }
  if (decideContactsPermissionAction(permission) === 'remove-source') {
    const removed = await withdrawContactSource(ports);
    if (removed.ok === false) return removed;
    return {
      ok: false,
      reason: 'contacts-os-denied',
      bookSynced: false,
    };
  }

  const enabled = await ports.client.enableContactsSync(
    buildEnableContactsSyncRequest(),
  );
  await persistSession(ports, enabled);
  await notifyAfterIdentity(ports, enabled);

  const synced = await syncGrantedAddressBook(ports);
  if (synced.ok === false) {
    return {
      ok: false,
      reason: synced.reason,
      bookSynced: false,
      identityEnabled: enabled.contactsSyncEnabled === true,
      result: enabled,
    };
  }
  return synced;
}

export async function syncGrantedAddressBook(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  const permission = await ports.book.getPermission();
  if (decideContactsPermissionAction(permission) !== 'sync') {
    return withdrawContactSource(ports);
  }

  const selected = selectUploadableIdentifiers(await ports.book.readRows());
  if (selected.ok === false) {
    return { ok: false, reason: selected.reason, bookSynced: false };
  }

  const session = await ports.session.load();
  const sourceId = session?.sourceId ?? (await ensureSourceId(ports));
  const fingerprint = fingerprintIdentifiers(selected.identifiers);
  const snapshotVersion = nextSnapshotVersion({
    lastVersion: session?.snapshotVersion ?? null,
    lastFingerprint: session?.fingerprint ?? null,
    nextFingerprint: fingerprint,
  });
  const contactsEpoch = session?.contactsEpoch ?? 0;

  try {
    const result = await ports.client.syncContactHashes(
      buildSyncContactHashesRequest({
        sourceId,
        snapshotVersion,
        contactsEpoch,
        identifiers: selected.identifiers,
      }),
    );
    const bookSynced =
      result.syncCommitted === true &&
      (result.result === 'synced' || result.result === 'idempotent');
    await persistSession(ports, result, {
      snapshotVersion: bookSynced
        ? result.snapshotVersion ?? snapshotVersion
        : session?.snapshotVersion ?? null,
      fingerprint: bookSynced ? fingerprint : session?.fingerprint ?? null,
    });
    await notifyAfterIdentity(ports, result);
    return { ok: true, result, bookSynced };
  } catch (err) {
    const reason =
      err instanceof ContactsHmacClientError
        ? err.reason
        : parseContactsHmacFailReason(err) ?? 'contacts-invalid-response';
    return { ok: false, reason, bookSynced: false };
  }
}

export async function disableContactsSyncFlow(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  const session = await ports.session.load();
  const contactsEpoch = session?.contactsEpoch ?? 0;
  try {
    const result = await ports.client.disableContactsSync(
      buildDisableContactsSyncRequest(contactsEpoch),
    );
    // Keep sourceId + monotonic snapshotVersion. Disable purges fences, but
    // the same install must not mint a fresh sourceId per sync to dodge them.
    await persistSession(ports, result, {
      snapshotVersion: session?.snapshotVersion ?? null,
      fingerprint: null,
    });
    await ports.session.clearFingerprint();
    await notifyAfterIdentity(ports, result);
    return { ok: true, result, bookSynced: false };
  } catch (err) {
    const reason =
      err instanceof ContactsHmacClientError
        ? err.reason
        : parseContactsHmacFailReason(err) ?? 'contacts-invalid-response';
    return { ok: false, reason, bookSynced: false };
  }
}

export async function withdrawContactSource(
  ports: ContactsControllerPorts,
): Promise<ContactsControllerOutcome> {
  const session = await ports.session.load();
  if (!session?.sourceId) {
    return {
      ok: false,
      reason: 'contacts-os-denied',
      bookSynced: false,
    };
  }
  try {
    const result = await ports.client.removeContactSource(
      buildRemoveContactSourceRequest({
        sourceId: session.sourceId,
        contactsEpoch: session.contactsEpoch,
      }),
    );
    // Identity sets removedSnapshotVersion to the withdrawn version. Keep the
    // local counter (prefer wire snapshotVersion) so the next sync after
    // re-consent is strictly greater. Clear fingerprint only — never raw book.
    const keptVersion =
      result.snapshotVersion ?? session.snapshotVersion ?? null;
    await persistSession(ports, result, {
      snapshotVersion: keptVersion,
      fingerprint: null,
    });
    await ports.session.clearFingerprint();
    await notifyAfterIdentity(ports, result);
    return { ok: true, result, bookSynced: false };
  } catch (err) {
    const reason =
      err instanceof ContactsHmacClientError
        ? err.reason
        : parseContactsHmacFailReason(err) ?? 'contacts-invalid-response';
    return { ok: false, reason, bookSynced: false };
  }
}

export async function refreshVerifiedActorKeysFlow(
  ports: Pick<ContactsControllerPorts, 'client' | 'afterIdentity' | 'session'>,
): Promise<ContactsControllerOutcome> {
  try {
    const result = await ports.client.refreshVerifiedActorKeys(
      buildRefreshVerifiedActorKeysRequest(),
    );
    const session = await ports.session?.load();
    if (session) {
      await ports.session.save({
        ...session,
        contactsEpoch: result.contactsEpoch,
      });
    }
    await notifyAfterIdentity(ports, result);
    return { ok: true, result, bookSynced: false };
  } catch (err) {
    const reason =
      err instanceof ContactsHmacClientError
        ? err.reason
        : parseContactsHmacFailReason(err) ?? 'contacts-invalid-response';
    return { ok: false, reason, bookSynced: false };
  }
}
