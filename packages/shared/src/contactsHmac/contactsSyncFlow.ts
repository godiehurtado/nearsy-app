import type { ContactIdentifierInput, ContactsWireResult } from './contactsHmacContract.ts';
import {
  ContactsHmacError,
  identifiersFingerprint,
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

export type ContactsLocalState = {
  sourceId: string;
  contactsEpoch: number;
  lastAckedVersion: number | null;
  lastAckedFingerprint: string | null;
};

export type ContactsFlowOutcome = {
  result: ContactsWireResult;
  state: ContactsLocalState;
  scheduleReevaluate: boolean;
  permission: ContactsPermissionStatus | null;
};

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
  return {
    sourceId: state.sourceId,
    contactsEpoch: result.contactsEpoch,
    lastAckedVersion:
      typeof result.snapshotVersion === 'number'
        ? result.snapshotVersion
        : fingerprint != null
          ? snapshotVersionForUpload({
              lastAckedVersion: state.lastAckedVersion,
              lastAckedFingerprint: state.lastAckedFingerprint,
              nextFingerprint: fingerprint,
            })
          : state.lastAckedVersion,
    lastAckedFingerprint:
      fingerprint ?? state.lastAckedFingerprint,
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
      state: {
        ...state,
        contactsEpoch: removed.contactsEpoch,
        lastAckedVersion: null,
        lastAckedFingerprint: null,
      },
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
  const snapshotVersion = snapshotVersionForUpload({
    lastAckedVersion: state.lastAckedVersion,
    lastAckedFingerprint: state.lastAckedFingerprint,
    nextFingerprint: fingerprint,
  });
  try {
    const synced = await syncContactHashes(input.functions, {
      sourceId: state.sourceId,
      snapshotVersion,
      contactsEpoch: state.contactsEpoch,
      identifiers: records,
    });
    state = applyAck(state, synced, fingerprint);
    return {
      result: synced,
      state,
      scheduleReevaluate:
        shouldScheduleReevaluate(enabled) || shouldScheduleReevaluate(synced),
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
      state = applyAck({ ...state, contactsEpoch: liveEpoch }, retried, fingerprint);
      return {
        result: retried,
        state,
        scheduleReevaluate:
          shouldScheduleReevaluate(enabled) || shouldScheduleReevaluate(retried),
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
      state: {
        ...input.state,
        contactsEpoch: removed.contactsEpoch,
        lastAckedVersion: null,
        lastAckedFingerprint: null,
      },
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
  const snapshotVersion = snapshotVersionForUpload({
    lastAckedVersion: input.state.lastAckedVersion,
    lastAckedFingerprint: input.state.lastAckedFingerprint,
    nextFingerprint: fingerprint,
  });
  const synced = await syncContactHashes(input.functions, {
    sourceId: input.state.sourceId,
    snapshotVersion,
    contactsEpoch: input.state.contactsEpoch,
    identifiers: records,
  });
  return {
    result: synced,
    state: applyAck(input.state, synced, fingerprint),
    scheduleReevaluate: shouldScheduleReevaluate(synced),
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
  return {
    result: disabled,
    state: {
      sourceId: input.state.sourceId,
      contactsEpoch: disabled.contactsEpoch,
      lastAckedVersion: null,
      lastAckedFingerprint: null,
    },
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
