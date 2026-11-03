import type { ContactIdentifierInput, ContactsWireResult } from './contactsHmacContract.ts';
import {
  ContactsFlowStateError,
  ContactsHmacError,
  ContactsSyncAfterEnableError,
  identifiersFingerprint,
  isConfirmedSnapshotResult,
  isContactsOutcomeUncertain,
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

export type ContactsEnableStage =
  | 'enabling'
  | 'permission'
  | 'reading'
  | 'syncing';

export type ContactsBookPort = {
  getPermission: () => Promise<ContactsPermissionStatus>;
  requestPermission: () => Promise<ContactsPermissionStatus>;
  readRecords: () => Promise<ContactIdentifierInput[] | { capExceeded: true }>;
};

/** A write whose outcome is unknown until a retry or a late result settles it. */
export type ContactsUncertainOp = 'enable' | 'sync' | 'remove' | 'disable';

/** Upload intent, saved before sending. A digest and a version: never the book. */
export type ContactsPendingUpload = {
  version: number;
  fingerprint: string;
  epoch: number;
};

/**
 * Local ack only. Never stores raw identifiers — fingerprint is a digest.
 * `removedSnapshotFloor` survives remove/reconnect so Identity fences are honored.
 * Optional fields are absent in state saved by earlier builds.
 */
export type ContactsLocalState = {
  sourceId: string;
  contactsEpoch: number;
  lastAckedVersion: number | null;
  lastAckedFingerprint: string | null;
  removedSnapshotFloor: number | null;
  /** Epoch the ack belongs to; another epoch means Identity no longer has it. */
  lastAckedEpoch?: number | null;
  pendingUpload?: ContactsPendingUpload | null;
  /** Never reuse or undercut a version sent earlier, even if it was not acked. */
  highestAttemptedVersion?: number | null;
  uncertainOp?: ContactsUncertainOp | null;
  /** A write may have asked for reevaluate; a later idempotent retry will not. */
  reevaluateOwed?: boolean;
  /** Last enabled value confirmed by Identity. */
  enablementConfirmed?: boolean;
  /** Set only by the user's own action on this device, never inferred. */
  userConsent?: boolean;
};

export type ContactsFlowOutcome = {
  /** Null when nothing was sent, e.g. a reconciliation without OS permission. */
  result: ContactsWireResult | null;
  state: ContactsLocalState;
  scheduleReevaluate: boolean;
  permission: ContactsPermissionStatus | null;
};

/** Persists intent before a write so a kill or timeout cannot lose it. */
export type ContactsStateSaver = (state: ContactsLocalState) => Promise<void>;

const noSave: ContactsStateSaver = async () => {};

function maxVersion(...values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (n): n is number => typeof n === 'number' && n >= 1,
  );
  return valid.length > 0 ? Math.max(...valid) : null;
}

function asHmacError(err: unknown): ContactsHmacError {
  if (err instanceof ContactsHmacError) return err;
  return new ContactsHmacError(
    'generic',
    err instanceof Error ? err.message : 'Contacts request failed.',
  );
}

/**
 * Adopt an epoch confirmed by Identity. Acks and intents of another epoch are
 * void, but their versions stay as a lower bound for the next upload.
 */
export function withConfirmedEpoch(
  state: ContactsLocalState,
  contactsEpoch: number,
): ContactsLocalState {
  const next: ContactsLocalState = { ...state, contactsEpoch };
  if (
    typeof state.lastAckedEpoch === 'number' &&
    state.lastAckedEpoch !== contactsEpoch
  ) {
    next.highestAttemptedVersion = maxVersion(
      next.highestAttemptedVersion,
      state.lastAckedVersion,
    );
    next.lastAckedVersion = null;
    next.lastAckedFingerprint = null;
    next.lastAckedEpoch = null;
  }
  if (state.pendingUpload && state.pendingUpload.epoch !== contactsEpoch) {
    next.highestAttemptedVersion = maxVersion(
      next.highestAttemptedVersion,
      state.pendingUpload.version,
    );
    next.pendingUpload = null;
  }
  return next;
}

function withRemoveIntent(state: ContactsLocalState): ContactsLocalState {
  return {
    ...state,
    // The remove may land even if its reply is lost: stay above any version
    // this source could have reached, so the next upload clears the fence.
    removedSnapshotFloor: removedSnapshotFloorAfterRemove({
      previousFloor: state.removedSnapshotFloor,
      removedSnapshotVersion: maxVersion(
        state.highestAttemptedVersion,
        state.pendingUpload?.version,
      ),
      lastAckedVersion: state.lastAckedVersion,
    }),
    pendingUpload: null,
    uncertainOp: 'remove',
    reevaluateOwed: true,
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
    ...withConfirmedEpoch(state, removed.contactsEpoch),
    lastAckedVersion: null,
    lastAckedFingerprint: null,
    lastAckedEpoch: null,
    removedSnapshotFloor: floor,
    pendingUpload: null,
    uncertainOp: null,
    reevaluateOwed: false,
  };
}

function applySnapshotAck(
  intent: ContactsLocalState,
  result: ContactsWireResult,
  version: number,
  fingerprint: string,
): ContactsLocalState {
  return {
    ...intent,
    contactsEpoch: result.contactsEpoch,
    lastAckedVersion: version,
    lastAckedFingerprint: fingerprint,
    lastAckedEpoch: result.contactsEpoch,
    // A confirmed sync above the fence clears the local floor for this source.
    removedSnapshotFloor: null,
    pendingUpload: null,
    uncertainOp: null,
    reevaluateOwed: false,
    enablementConfirmed: result.contactsSyncEnabled,
  };
}

/** Local effect of an Identity disable; versions stay monotonic for this source. */
function applyDisabled(
  state: ContactsLocalState,
  contactsEpoch: number,
): ContactsLocalState {
  return {
    sourceId: state.sourceId,
    contactsEpoch,
    lastAckedVersion: null,
    lastAckedFingerprint: null,
    lastAckedEpoch: null,
    removedSnapshotFloor: null,
    pendingUpload: null,
    highestAttemptedVersion: maxVersion(
      state.highestAttemptedVersion,
      state.pendingUpload?.version,
      state.lastAckedVersion,
    ),
    uncertainOp: null,
    reevaluateOwed: false,
    enablementConfirmed: false,
    userConsent: false,
  };
}

/**
 * Late or reconciled results land here, so a reply that arrives after its
 * timeout has exactly the same effect as one that arrived in time.
 */
export function applyLateIdentityResult(
  state: ContactsLocalState,
  op: 'enable' | 'sync' | 'remove' | 'disable' | 'refresh',
  result: ContactsWireResult,
  sentVersion?: number,
): ContactsLocalState {
  switch (op) {
    case 'enable':
      if (!result.syncCommitted || !result.contactsSyncEnabled) return state;
      return {
        ...withConfirmedEpoch(state, result.contactsEpoch),
        enablementConfirmed: true,
        uncertainOp: state.uncertainOp === 'enable' ? null : state.uncertainOp,
      };
    case 'sync': {
      const pending = state.pendingUpload;
      if (
        !pending ||
        pending.version !== sentVersion ||
        !isConfirmedSnapshotResult(result, {
          sourceId: state.sourceId,
          snapshotVersion: pending.version,
        })
      ) {
        return state;
      }
      return applySnapshotAck(state, result, pending.version, pending.fingerprint);
    }
    case 'remove':
      return result.syncCommitted ? applyRemoveFence(state, result) : state;
    case 'disable':
      return result.syncCommitted && !result.contactsSyncEnabled
        ? applyDisabled(state, result.contactsEpoch)
        : state;
    case 'refresh':
      return {
        ...withConfirmedEpoch(state, result.contactsEpoch),
        enablementConfirmed: result.contactsSyncEnabled,
      };
  }
}

/** Identity conflicts mean this version is taken: the next upload must go higher. */
function versionIsSpent(reason: ContactsHmacError['reason']): boolean {
  return (
    reason === 'contacts-snapshot-conflict' ||
    reason === 'contacts-snapshot-stale' ||
    reason === 'contacts-source-removed'
  );
}

async function uploadSnapshot(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
  identifiers: ContactIdentifierInput[];
  fingerprint: string;
  save: ContactsStateSaver;
}): Promise<{
  result: ContactsWireResult;
  state: ContactsLocalState;
  scheduleReevaluate: boolean;
}> {
  const { state, fingerprint } = input;
  const priorOwed = state.reevaluateOwed === true;
  const version = snapshotVersionForUpload({
    lastAckedVersion: state.lastAckedVersion,
    lastAckedFingerprint: state.lastAckedFingerprint,
    nextFingerprint: fingerprint,
    removedSnapshotFloor: state.removedSnapshotFloor,
    pendingUpload: state.pendingUpload,
    highestAttemptedVersion: state.highestAttemptedVersion,
  });
  const intent: ContactsLocalState = {
    ...state,
    pendingUpload: { version, fingerprint, epoch: state.contactsEpoch },
    highestAttemptedVersion: maxVersion(state.highestAttemptedVersion, version),
    uncertainOp: 'sync',
    reevaluateOwed: true,
  };
  await input.save(intent);

  let result: ContactsWireResult;
  try {
    result = await syncContactHashes(input.functions, {
      sourceId: state.sourceId,
      snapshotVersion: version,
      contactsEpoch: state.contactsEpoch,
      identifiers: input.identifiers,
    });
  } catch (err) {
    const cause = asHmacError(err);
    if (isContactsOutcomeUncertain(cause.reason)) {
      throw new ContactsFlowStateError(cause, intent);
    }
    throw new ContactsFlowStateError(cause, {
      ...intent,
      uncertainOp: null,
      reevaluateOwed: priorOwed,
      pendingUpload: versionIsSpent(cause.reason) ? null : intent.pendingUpload,
    });
  }

  if (
    !isConfirmedSnapshotResult(result, {
      sourceId: state.sourceId,
      snapshotVersion: version,
    })
  ) {
    // Answered, but not a commit: no ack, and the same version stays reusable.
    return {
      result,
      state: {
        ...withConfirmedEpoch(intent, result.contactsEpoch),
        uncertainOp: null,
      },
      scheduleReevaluate: false,
    };
  }
  return {
    result,
    state: applySnapshotAck(intent, result, version, fingerprint),
    scheduleReevaluate: shouldScheduleReevaluate(result) || priorOwed,
  };
}

export async function runEnableThenSync(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  onStage?: (stage: ContactsEnableStage) => void;
  saveState?: ContactsStateSaver;
}): Promise<ContactsFlowOutcome> {
  const save = input.saveState ?? noSave;
  const priorOwed = input.state.reevaluateOwed === true;
  input.onStage?.('enabling');
  const enableIntent: ContactsLocalState = {
    ...input.state,
    uncertainOp: 'enable',
    reevaluateOwed: true,
  };
  await save(enableIntent);

  let enabled: ContactsWireResult;
  try {
    enabled = await enableContactsSync(input.functions);
    if (!enabled.syncCommitted || !enabled.contactsSyncEnabled) {
      throw new ContactsHmacError('generic', 'Contacts sync was not enabled.');
    }
  } catch (err) {
    const cause = asHmacError(err);
    throw new ContactsFlowStateError(
      cause,
      isContactsOutcomeUncertain(cause.reason) ? enableIntent : input.state,
    );
  }

  // Confirmed from here on: the epoch comes from this response, nothing older.
  const owedFromEnable = shouldScheduleReevaluate(enabled) || priorOwed;
  const state: ContactsLocalState = {
    ...withConfirmedEpoch(enableIntent, enabled.contactsEpoch),
    enablementConfirmed: true,
    uncertainOp: null,
    reevaluateOwed: owedFromEnable,
  };
  const afterEnableError = (
    cause: ContactsHmacError,
    after: ContactsLocalState,
    permission: ContactsPermissionStatus | null,
  ) =>
    new ContactsSyncAfterEnableError(
      cause,
      enabled,
      {
        ...after,
        // Only a write that may still have landed keeps it owed.
        reevaluateOwed: isContactsOutcomeUncertain(cause.reason),
      },
      { permission, scheduleReevaluate: owedFromEnable },
    );

  let permission: ContactsPermissionStatus | null = null;
  try {
    await save(state);
    input.onStage?.('permission');
    permission = await input.book.requestPermission();
  } catch (err) {
    throw afterEnableError(asHmacError(err), state, permission);
  }

  if (permission === 'undetermined') {
    // No decision from the user: nothing to withdraw, nothing synced.
    return {
      result: enabled,
      state: { ...state, reevaluateOwed: false },
      scheduleReevaluate: owedFromEnable,
      permission,
    };
  }

  if (permission !== 'granted') {
    const removeIntent = withRemoveIntent(state);
    try {
      await save(removeIntent);
      const removed = await removeContactSource(input.functions, {
        sourceId: state.sourceId,
        contactsEpoch: state.contactsEpoch,
      });
      return {
        result: removed,
        state: applyRemoveFence(removeIntent, removed),
        scheduleReevaluate:
          owedFromEnable || shouldScheduleReevaluate(removed),
        permission,
      };
    } catch (err) {
      const cause = asHmacError(err);
      throw afterEnableError(
        cause,
        isContactsOutcomeUncertain(cause.reason)
          ? removeIntent
          : { ...removeIntent, uncertainOp: null },
        permission,
      );
    }
  }

  let records: ContactIdentifierInput[] | { capExceeded: true };
  try {
    input.onStage?.('reading');
    records = await input.book.readRecords();
  } catch (err) {
    throw afterEnableError(asHmacError(err), state, permission);
  }
  if ('capExceeded' in records) {
    throw afterEnableError(
      new ContactsHmacError(
        'contacts-identifier-cap',
        'Too many identifiers in this snapshot. (contacts-identifier-cap)',
      ),
      state,
      permission,
    );
  }

  input.onStage?.('syncing');
  try {
    const synced = await uploadSnapshot({
      functions: input.functions,
      state,
      identifiers: records,
      fingerprint: identifiersFingerprint(records),
      save,
    });
    return {
      result: synced.result,
      state: synced.state,
      scheduleReevaluate: synced.scheduleReevaluate || owedFromEnable,
      permission,
    };
  } catch (err) {
    const cause = asHmacError(err);
    throw afterEnableError(
      cause,
      err instanceof ContactsFlowStateError ? err.state : state,
      permission,
    );
  }
}

/**
 * Sync with what the OS already allows. Reconciliation must not prompt, delete
 * or claim success: without a grant it only reports that the snapshot is pending.
 */
export async function runResyncGrantedBook(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  saveState?: ContactsStateSaver;
}): Promise<ContactsFlowOutcome> {
  const permission = await input.book.getPermission();
  if (permission !== 'granted') {
    return {
      result: null,
      state: input.state,
      scheduleReevaluate: false,
      permission,
    };
  }
  const records = await input.book.readRecords();
  if ('capExceeded' in records) {
    throw new ContactsFlowStateError(
      new ContactsHmacError(
        'contacts-identifier-cap',
        'Too many identifiers in this snapshot. (contacts-identifier-cap)',
      ),
      input.state,
      { permission },
    );
  }
  try {
    const synced = await uploadSnapshot({
      functions: input.functions,
      state: input.state,
      identifiers: records,
      fingerprint: identifiersFingerprint(records),
      save: input.saveState ?? noSave,
    });
    return {
      result: synced.result,
      state: synced.state,
      scheduleReevaluate: synced.scheduleReevaluate,
      permission,
    };
  } catch (err) {
    if (err instanceof ContactsFlowStateError) {
      throw new ContactsFlowStateError(err, err.state, { permission });
    }
    throw err;
  }
}

export async function runDisable(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
  saveState?: ContactsStateSaver;
}): Promise<ContactsFlowOutcome> {
  const priorOwed = input.state.reevaluateOwed === true;
  const intent: ContactsLocalState = {
    ...input.state,
    uncertainOp: 'disable',
    reevaluateOwed: true,
  };
  await (input.saveState ?? noSave)(intent);

  const failure = (err: unknown) => {
    const cause = asHmacError(err);
    return new ContactsFlowStateError(
      cause,
      isContactsOutcomeUncertain(cause.reason) ? intent : input.state,
    );
  };
  const finished = (result: ContactsWireResult): ContactsFlowOutcome => ({
    result,
    // Disable deletes Identity fences; the local floor resets with the new epoch.
    state: applyDisabled(intent, result.contactsEpoch),
    scheduleReevaluate: shouldScheduleReevaluate(result) || priorOwed,
    permission: null,
  });

  let firstError: unknown;
  try {
    return finished(
      await disableContactsSync(input.functions, input.state.contactsEpoch),
    );
  } catch (err) {
    firstError = err;
  }
  if (
    !(firstError instanceof ContactsHmacError) ||
    firstError.reason !== 'contacts-epoch-mismatch'
  ) {
    throw failure(firstError);
  }

  // Our epoch is old, e.g. an earlier uncertain disable did land. Ask Identity.
  try {
    const live = await refreshVerifiedActorKeys(input.functions);
    if (!live.contactsSyncEnabled) return finished(live);
    return finished(
      await disableContactsSync(input.functions, live.contactsEpoch),
    );
  } catch (err) {
    throw failure(err);
  }
}

export async function runRefreshKeys(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
}): Promise<ContactsFlowOutcome> {
  const refreshed = await refreshVerifiedActorKeys(input.functions);
  return {
    result: refreshed,
    state: applyLateIdentityResult(input.state, 'refresh', refreshed),
    scheduleReevaluate: shouldScheduleReevaluate(refreshed),
    permission: null,
  };
}
