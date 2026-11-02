import type { ContactIdentifierInput, ContactsWireResult } from './contactsHmacContract.ts';
import {
  ContactsHmacError,
  identifiersFingerprint,
  removedSnapshotFloorAfterRemove,
  shouldScheduleReevaluate,
  snapshotVersionForUpload,
  type ContactsHmacFunctionsPort,
} from './contactsHmacCore.ts';
import {
  disableContactsSync,
  enableContactsSync,
  refreshVerifiedActorKeys,
  removeContactSource,
  syncContactHashes,
} from './contactsHmacCore.ts';

export type ContactsPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type ContactsBookPort = {
  getPermission: () => Promise<ContactsPermissionStatus>;
  requestPermission: () => Promise<ContactsPermissionStatus>;
  readRecords: () => Promise<ContactIdentifierInput[] | { capExceeded: true }>;
};

/**
 * Local ack only. Never stores raw identifiers — fingerprint is a digest.
 * `removedSnapshotFloor` survives remove/reconnect so Identity fences are honored.
 */
export type ContactsLocalState = {
  sourceId: string;
  contactsEpoch: number;
  lastAckedVersion: number | null;
  lastAckedFingerprint: string | null;
  removedSnapshotFloor: number | null;
};

export type ContactsFlowOutcome = {
  result: ContactsWireResult;
  state: ContactsLocalState;
  scheduleReevaluate: boolean;
  permission: ContactsPermissionStatus | null;
};

function emptyLocalAcks(
  sourceId: string,
  contactsEpoch: number,
  removedSnapshotFloor: number | null = null,
): ContactsLocalState {
  return {
    sourceId,
    contactsEpoch,
    lastAckedVersion: null,
    lastAckedFingerprint: null,
    removedSnapshotFloor,
  };
}

async function retrySyncOnceOnEpochMismatch(
  functions: ContactsHmacFunctionsPort,
  state: ContactsLocalState,
  identifiers: ContactIdentifierInput[],
  fingerprint: string,
  liveEpoch: number,
): Promise<ContactsWireResult> {
  const snapshotVersion = snapshotVersionForUpload({
    lastAckedVersion: state.lastAckedVersion,
    lastAckedFingerprint: state.lastAckedFingerprint,
    nextFingerprint: fingerprint,
    removedSnapshotFloor: state.removedSnapshotFloor,
  });
  return syncContactHashes(functions, {
    sourceId: state.sourceId,
    snapshotVersion,
    contactsEpoch: liveEpoch,
    identifiers,
  });
}

function applyAck(
  state: ContactsLocalState,
  result: ContactsWireResult,
  fingerprint: string | null,
): ContactsLocalState {
  const version =
    typeof result.snapshotVersion === 'number'
      ? result.snapshotVersion
      : fingerprint != null
        ? snapshotVersionForUpload({
            lastAckedVersion: state.lastAckedVersion,
            lastAckedFingerprint: state.lastAckedFingerprint,
            nextFingerprint: fingerprint,
            removedSnapshotFloor: state.removedSnapshotFloor,
          })
        : state.lastAckedVersion;
  return {
    sourceId: state.sourceId,
    contactsEpoch: result.contactsEpoch,
    lastAckedVersion: version,
    lastAckedFingerprint: fingerprint ?? state.lastAckedFingerprint,
    // Successful sync above the fence clears the local floor for this source.
    removedSnapshotFloor: null,
  };
}

function applyRemoveFence(
  state: ContactsLocalState,
  removed: ContactsWireResult,
): ContactsLocalState {
  const floor = removedSnapshotFloorAfterRemove({
    previousFloor: state.removedSnapshotFloor,
    removedSnapshotVersion: removed.snapshotVersion,
    lastAckedVersion: state.lastAckedVersion,
  });
  return {
    ...emptyLocalAcks(state.sourceId, removed.contactsEpoch, floor),
  };
}

async function syncWithCaps(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
  identifiers: ContactIdentifierInput[];
  fingerprint: string;
}): Promise<{ result: ContactsWireResult; state: ContactsLocalState }> {
  const snapshotVersion = snapshotVersionForUpload({
    lastAckedVersion: input.state.lastAckedVersion,
    lastAckedFingerprint: input.state.lastAckedFingerprint,
    nextFingerprint: input.fingerprint,
    removedSnapshotFloor: input.state.removedSnapshotFloor,
  });
  const synced = await syncContactHashes(input.functions, {
    sourceId: input.state.sourceId,
    snapshotVersion,
    contactsEpoch: input.state.contactsEpoch,
    identifiers: input.identifiers,
  });
  return {
    result: synced,
    state: applyAck(input.state, synced, input.fingerprint),
  };
}

export async function runEnableThenSync(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  liveEpochHint?: number;
}): Promise<ContactsFlowOutcome> {
  const enabled = await enableContactsSync(input.functions);
  let state: ContactsLocalState = {
    ...input.state,
    contactsEpoch: enabled.contactsEpoch,
  };
  const permission = await input.book.requestPermission();
  if (permission !== 'granted') {
    const removed = await removeContactSource(input.functions, {
      sourceId: state.sourceId,
      contactsEpoch: state.contactsEpoch,
    });
    return {
      result: removed,
      state: applyRemoveFence(state, removed),
      scheduleReevaluate:
        shouldScheduleReevaluate(enabled) || shouldScheduleReevaluate(removed),
      permission,
    };
  }

  const records = await input.book.readRecords();
  if ('capExceeded' in records) {
    throw new ContactsHmacError(
      'contacts-identifier-cap',
      'Too many identifiers in this snapshot. (contacts-identifier-cap)',
    );
  }
  const fingerprint = identifiersFingerprint(records);
  try {
    const synced = await syncWithCaps({
      functions: input.functions,
      state,
      identifiers: records,
      fingerprint,
    });
    return {
      result: synced.result,
      state: synced.state,
      scheduleReevaluate:
        shouldScheduleReevaluate(enabled) ||
        shouldScheduleReevaluate(synced.result),
      permission,
    };
  } catch (err) {
    if (
      err instanceof ContactsHmacError &&
      err.reason === 'contacts-epoch-mismatch'
    ) {
      const liveEpoch =
        typeof input.liveEpochHint === 'number'
          ? input.liveEpochHint
          : state.contactsEpoch;
      const retried = await retrySyncOnceOnEpochMismatch(
        input.functions,
        { ...state, contactsEpoch: liveEpoch },
        records,
        fingerprint,
        liveEpoch,
      );
      return {
        result: retried,
        state: applyAck(
          { ...state, contactsEpoch: liveEpoch },
          retried,
          fingerprint,
        ),
        scheduleReevaluate:
          shouldScheduleReevaluate(enabled) ||
          shouldScheduleReevaluate(retried),
        permission,
      };
    }
    throw err;
  }
}

export async function runResyncGrantedBook(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  liveEpochHint?: number;
}): Promise<ContactsFlowOutcome> {
  const permission = await input.book.getPermission();
  if (permission !== 'granted') {
    const removed = await removeContactSource(input.functions, {
      sourceId: input.state.sourceId,
      contactsEpoch: input.state.contactsEpoch,
    });
    return {
      result: removed,
      state: applyRemoveFence(input.state, removed),
      scheduleReevaluate: shouldScheduleReevaluate(removed),
      permission,
    };
  }
  const records = await input.book.readRecords();
  if ('capExceeded' in records) {
    throw new ContactsHmacError(
      'contacts-identifier-cap',
      'Too many identifiers in this snapshot. (contacts-identifier-cap)',
    );
  }
  const fingerprint = identifiersFingerprint(records);
  const synced = await syncWithCaps({
    functions: input.functions,
    state: input.state,
    identifiers: records,
    fingerprint,
  });
  return {
    result: synced.result,
    state: synced.state,
    scheduleReevaluate: shouldScheduleReevaluate(synced.result),
    permission,
  };
}

export async function runDisable(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
}): Promise<ContactsFlowOutcome> {
  const disabled = await disableContactsSync(
    input.functions,
    input.state.contactsEpoch,
  );
  // Disable deletes Identity fences; local floor resets with the new epoch.
  return {
    result: disabled,
    state: emptyLocalAcks(input.state.sourceId, disabled.contactsEpoch, null),
    scheduleReevaluate: shouldScheduleReevaluate(disabled),
    permission: null,
  };
}

export async function runRefreshKeys(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
}): Promise<ContactsFlowOutcome> {
  const refreshed = await refreshVerifiedActorKeys(input.functions);
  return {
    result: refreshed,
    state: {
      ...input.state,
      contactsEpoch: refreshed.contactsEpoch,
    },
    scheduleReevaluate: shouldScheduleReevaluate(refreshed),
    permission: null,
  };
}
