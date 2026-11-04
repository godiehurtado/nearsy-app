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
  /** contactsEpoch came from an Identity success; a read of the doc does not count. */
  epochConfirmed?: boolean;
  /** Identity rejected our epoch: read its state before relying on it again. */
  epochStale?: boolean;
  /** Highest version sent in that epoch, uncertain ones included. */
  sentSnapshot?: { epoch: number; version: number } | null;
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
 * Move to a higher epoch. Acks and intents of another epoch are void, but their
 * versions stay as a lower bound for the next upload. It never moves down: replies
 * can arrive out of order.
 */
export function withHigherEpoch(
  state: ContactsLocalState,
  contactsEpoch: number,
): ContactsLocalState {
  if (contactsEpoch < state.contactsEpoch) return state;
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

/** An epoch from an Identity success: this is what may be sent in enable. */
export function withConfirmedEpoch(
  state: ContactsLocalState,
  contactsEpoch: number,
): ContactsLocalState {
  if (contactsEpoch < state.contactsEpoch) return state;
  return {
    ...withHigherEpoch(state, contactsEpoch),
    epochConfirmed: true,
    epochStale: false,
  };
}

/** Contract §14.3: highest sent for this source in this epoch, or 0. */
export function knownSnapshotVersionForRemove(state: ContactsLocalState): number {
  const epoch = state.contactsEpoch;
  return (
    maxVersion(
      state.sentSnapshot?.epoch === epoch ? state.sentSnapshot.version : null,
      state.lastAckedEpoch === epoch ? state.lastAckedVersion : null,
      state.pendingUpload?.epoch === epoch ? state.pendingUpload.version : null,
    ) ?? 0
  );
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

/** Nothing was withdrawn: a newer snapshot is stored, so go above it from now on. */
function applySuperseded(
  beforeRemove: ContactsLocalState,
  result: ContactsWireResult,
): ContactsLocalState {
  const stored = result.snapshotVersion ?? 0;
  return {
    ...withConfirmedEpoch(beforeRemove, result.contactsEpoch),
    highestAttemptedVersion: maxVersion(
      beforeRemove.highestAttemptedVersion,
      stored,
    ),
    sentSnapshot: {
      epoch: result.contactsEpoch,
      version: Math.max(knownSnapshotVersionForRemove(beforeRemove), stored),
    },
    pendingUpload: null,
    uncertainOp: null,
  };
}

function applySnapshotAck(
  intent: ContactsLocalState,
  result: ContactsWireResult,
  version: number,
  fingerprint: string,
): ContactsLocalState {
  return {
    ...withConfirmedEpoch(intent, result.contactsEpoch),
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
    epochConfirmed: true,
    epochStale: false,
    sentSnapshot: null,
  };
}

/** Turning off cancels what was pending, before anything is sent (contract §14.5). */
export function withDisableIntent(state: ContactsLocalState): ContactsLocalState {
  return {
    ...state,
    highestAttemptedVersion: maxVersion(
      state.highestAttemptedVersion,
      state.pendingUpload?.version,
    ),
    pendingUpload: null,
    userConsent: false,
    uncertainOp: 'disable',
    reevaluateOwed: true,
  };
}

/**
 * A reply that arrives after its timeout. The epoch only grows and only disable
 * grows it, so it orders replies against what is already known: a reply cannot
 * undo a newer state. This protects local state only; the write it describes has
 * already happened on the server, whatever is decided here.
 */
export function applyLateIdentityResult(
  state: ContactsLocalState,
  op: 'enable' | 'sync' | 'remove' | 'disable' | 'refresh',
  result: ContactsWireResult,
  sentVersion?: number,
): ContactsLocalState {
  if (result.contactsEpoch < state.contactsEpoch) return state;
  switch (op) {
    case 'enable':
      if (!result.syncCommitted || !result.contactsSyncEnabled) return state;
      if (state.uncertainOp === 'disable') return state;
      return {
        ...withConfirmedEpoch(state, result.contactsEpoch),
        enablementConfirmed: true,
        uncertainOp: state.uncertainOp === 'enable' ? null : state.uncertainOp,
      };
    case 'sync': {
      const pending = state.pendingUpload;
      if (
        state.uncertainOp === 'disable' ||
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
      if (state.uncertainOp === 'disable') return state;
      if (result.result === 'superseded') return applySuperseded(state, result);
      return result.syncCommitted ? applyRemoveFence(state, result) : state;
    case 'disable':
      if (!result.syncCommitted || result.contactsSyncEnabled) return state;
      // At the same epoch, what we hold came after this disable landed.
      if (
        state.uncertainOp !== 'disable' &&
        result.contactsEpoch <= state.contactsEpoch
      ) {
        return state;
      }
      return applyDisabled(state, result.contactsEpoch);
    case 'refresh':
      return applyLiveState(state, result);
  }
}

/** What a refresh reports. It settles only an unknown result it can actually answer. */
function applyLiveState(
  state: ContactsLocalState,
  live: ContactsWireResult,
): ContactsLocalState {
  if (live.contactsEpoch < state.contactsEpoch) return state;
  const next: ContactsLocalState = {
    ...withConfirmedEpoch(state, live.contactsEpoch),
    enablementConfirmed: live.contactsSyncEnabled,
  };
  if (state.uncertainOp === 'enable' && live.contactsSyncEnabled) {
    next.uncertainOp = null;
  }
  if (state.uncertainOp === 'disable' && !live.contactsSyncEnabled) {
    next.uncertainOp = null;
    next.userConsent = false;
  }
  return next;
}

/** Identity says this is off: nothing pending may go on as if it were on. */
function applyStoppedOff(
  state: ContactsLocalState,
  live: ContactsWireResult,
): ContactsLocalState {
  return {
    ...applyLiveState(state, live),
    pendingUpload: null,
    uncertainOp: null,
    userConsent: false,
    enablementConfirmed: false,
  };
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
    sentSnapshot: {
      epoch: state.contactsEpoch,
      version: Math.max(knownSnapshotVersionForRemove(state), version),
    },
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
    const spent = versionIsSpent(cause.reason);
    throw new ContactsFlowStateError(cause, {
      ...intent,
      // This request wrote nothing, which says nothing about an earlier unknown
      // attempt: that one stays unknown unless Identity's answer settles it.
      uncertainOp:
        state.uncertainOp === 'sync' &&
        !spent &&
        cause.reason !== 'contacts-epoch-mismatch' &&
        cause.reason !== 'contacts-not-enabled'
          ? 'sync'
          : null,
      reevaluateOwed: priorOwed,
      pendingUpload: spent ? null : intent.pendingUpload,
      epochStale:
        cause.reason === 'contacts-epoch-mismatch' ||
        cause.reason === 'contacts-not-enabled',
      enablementConfirmed:
        cause.reason === 'contacts-not-enabled'
          ? false
          : intent.enablementConfirmed,
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

/**
 * Contract §14.4 for a sync: on a mismatch read the state once. Off stops here and
 * never re-enables; on uploads at the live epoch, once. If the read does not answer,
 * the result stays pending, with no retries of its own.
 */
async function uploadWithEpochRecovery(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
  identifiers: ContactIdentifierInput[];
  fingerprint: string;
  save: ContactsStateSaver;
  book: ContactsBookPort;
}) {
  try {
    return await uploadSnapshot(input);
  } catch (err) {
    if (
      !(err instanceof ContactsFlowStateError) ||
      err.reason !== 'contacts-epoch-mismatch'
    ) {
      throw err;
    }
    let live: ContactsWireResult;
    try {
      live = await refreshVerifiedActorKeys(input.functions);
    } catch (readErr) {
      throw new ContactsFlowStateError(asHmacError(readErr), err.state);
    }
    if (!live.contactsSyncEnabled) {
      throw new ContactsFlowStateError(err, applyStoppedOff(err.state, live));
    }
    const atLiveEpoch = applyLiveState(err.state, live);
    // Sending again needs all of it still in force. A disable or an account change
    // has already stopped this flow at the guards around the port and the book.
    if (
      atLiveEpoch.userConsent !== true ||
      (await input.book.getPermission()) !== 'granted'
    ) {
      throw new ContactsFlowStateError(err, {
        ...atLiveEpoch,
        pendingUpload: null,
        uncertainOp: null,
      });
    }
    return uploadSnapshot({ ...input, state: atLiveEpoch });
  }
}

/**
 * Everything after a confirmed enable. Permission here is the user's own action;
 * reconciliation goes through runResyncGrantedBook and never reaches this.
 */
async function syncAfterConfirmedEnable(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  save: ContactsStateSaver;
  onStage?: (stage: ContactsEnableStage) => void;
  enableResult: ContactsWireResult | null;
  /** Already asked before Identity: not asked again. */
  knownPermission?: ContactsPermissionStatus;
  failure: (
    cause: ContactsHmacError,
    after: ContactsLocalState,
    permission: ContactsPermissionStatus | null,
  ) => ContactsHmacError;
}): Promise<ContactsFlowOutcome> {
  const { state, save, failure } = input;
  const owed = state.reevaluateOwed === true;

  let permission: ContactsPermissionStatus | null = input.knownPermission ?? null;
  try {
    await save(state);
    if (!permission) {
      input.onStage?.('permission');
      permission = await input.book.requestPermission();
    }
  } catch (err) {
    throw failure(asHmacError(err), state, permission);
  }

  if (permission === 'undetermined') {
    // No decision from the user: nothing to withdraw, nothing synced.
    const fireNow = owed && !state.uncertainOp;
    return {
      result: input.enableResult,
      state: fireNow ? { ...state, reevaluateOwed: false } : state,
      scheduleReevaluate: fireNow,
      permission,
    };
  }

  if (permission !== 'granted') {
    const removeIntent = withRemoveIntent(state);
    try {
      await save(removeIntent);
      let removed = await removeContactSource(input.functions, {
        sourceId: state.sourceId,
        contactsEpoch: state.contactsEpoch,
        knownSnapshotVersion: knownSnapshotVersionForRemove(state),
      });
      if (removed.result === 'superseded') {
        // This denial is still the user's current intent: once, above what is stored.
        removed = await removeContactSource(input.functions, {
          sourceId: state.sourceId,
          contactsEpoch: removed.contactsEpoch,
          knownSnapshotVersion: removed.snapshotVersion ?? 0,
        });
      }
      if (removed.result === 'superseded') {
        return {
          result: removed,
          state: {
            ...applySuperseded(state, removed),
            reevaluateOwed: false,
          },
          scheduleReevaluate: owed,
          permission,
        };
      }
      return {
        result: removed,
        state: applyRemoveFence(removeIntent, removed),
        scheduleReevaluate: owed || shouldScheduleReevaluate(removed),
        permission,
      };
    } catch (err) {
      const cause = asHmacError(err);
      throw failure(
        cause,
        isContactsOutcomeUncertain(cause.reason)
          ? removeIntent
          : { ...removeIntent, uncertainOp: null, reevaluateOwed: owed },
        permission,
      );
    }
  }

  let records: ContactIdentifierInput[] | { capExceeded: true };
  try {
    input.onStage?.('reading');
    records = await input.book.readRecords();
  } catch (err) {
    throw failure(asHmacError(err), state, permission);
  }
  if ('capExceeded' in records) {
    throw failure(
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
    const synced = await uploadWithEpochRecovery({
      functions: input.functions,
      book: input.book,
      state,
      identifiers: records,
      fingerprint: identifiersFingerprint(records),
      save,
    });
    return {
      result: synced.result,
      state: synced.state,
      scheduleReevaluate: synced.scheduleReevaluate || (owed && !state.uncertainOp),
      permission,
    };
  } catch (err) {
    throw failure(
      asHmacError(err),
      err instanceof ContactsFlowStateError ? err.state : state,
      permission,
    );
  }
}

/**
 * The caller has the user's acceptance of the disclosure. Then: OS permission, and only
 * with it the first call to Identity. Without it, nothing reaches Identity.
 *
 * Enable names the epoch it believes is live, so a late one cannot undo a disable.
 * Without a confirmed epoch it asks Identity first, and never assumes 0.
 */
export async function runEnableThenSync(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  onStage?: (stage: ContactsEnableStage) => void;
  saveState?: ContactsStateSaver;
  /** False when this is not a request to turn on: if it reads off, it stops there. */
  mayEnable?: boolean;
}): Promise<ContactsFlowOutcome> {
  const save = input.saveState ?? noSave;
  const mayEnable = input.mayEnable !== false;

  input.onStage?.('permission');
  let osPermission: ContactsPermissionStatus;
  try {
    osPermission = await input.book.requestPermission();
  } catch (err) {
    throw new ContactsFlowStateError(asHmacError(err), input.state);
  }
  if (osPermission !== 'granted' && input.state.enablementConfirmed !== true) {
    // Stays off. An earlier unknown enable stays unknown; otherwise consent led nowhere.
    return {
      result: null,
      state: input.state.uncertainOp
        ? input.state
        : { ...input.state, userConsent: false },
      scheduleReevaluate: false,
      permission: osPermission,
    };
  }

  input.onStage?.('enabling');
  let base = input.state;
  let live: ContactsWireResult | null = null;
  if (base.epochConfirmed !== true || base.epochStale === true) {
    try {
      live = await refreshVerifiedActorKeys(input.functions);
    } catch (err) {
      throw new ContactsFlowStateError(asHmacError(err), input.state);
    }
    base = applyLiveState(base, live);
  }

  const offAndStays = (cause: ContactsHmacError, reading: ContactsWireResult) =>
    new ContactsFlowStateError(cause, applyStoppedOff(base, reading), {
      scheduleReevaluate: shouldScheduleReevaluate(reading),
    });

  let enabled: ContactsWireResult;
  if (live?.contactsSyncEnabled) {
    // Already on: nothing to enable (contract §14.4).
    enabled = live;
  } else if (!mayEnable && live) {
    throw offAndStays(
      new ContactsHmacError(
        'contacts-epoch-mismatch',
        'Contacts sync is off. (contacts-epoch-mismatch)',
      ),
      live,
    );
  } else {
    const enableIntent: ContactsLocalState = {
      ...base,
      uncertainOp: 'enable',
      reevaluateOwed: true,
    };
    await save(enableIntent);
    try {
      enabled = await enableContactsSync(input.functions, base.contactsEpoch);
      if (!enabled.syncCommitted || !enabled.contactsSyncEnabled) {
        throw new ContactsHmacError(
          'contacts-result-unknown',
          'Contacts sync was not confirmed.',
        );
      }
    } catch (err) {
      const cause = asHmacError(err);
      if (isContactsOutcomeUncertain(cause.reason)) {
        throw new ContactsFlowStateError(cause, enableIntent);
      }
      if (
        cause.reason !== 'contacts-epoch-mismatch' &&
        cause.reason !== 'contacts-epoch-required'
      ) {
        throw new ContactsFlowStateError(cause, base);
      }
      // The state changed since this intent. Read it; turning on again takes a new
      // action from the user, with the epoch this returns.
      let reading: ContactsWireResult;
      try {
        reading = await refreshVerifiedActorKeys(input.functions);
      } catch (readErr) {
        throw new ContactsFlowStateError(asHmacError(readErr), {
          ...base,
          epochStale: true,
        });
      }
      base = applyLiveState(base, reading);
      if (!reading.contactsSyncEnabled) throw offAndStays(cause, reading);
      enabled = reading;
    }
  }

  // Confirmed from here on: the epoch comes from this response, nothing older.
  const owedFromEnable =
    shouldScheduleReevaluate(enabled) ||
    (live != null && shouldScheduleReevaluate(live)) ||
    input.state.reevaluateOwed === true;
  return syncAfterConfirmedEnable({
    functions: input.functions,
    book: input.book,
    save,
    onStage: input.onStage,
    enableResult: enabled,
    knownPermission: osPermission,
    state: {
      ...withConfirmedEpoch(base, enabled.contactsEpoch),
      enablementConfirmed: true,
      uncertainOp: input.state.uncertainOp === 'sync' ? 'sync' : null,
      reevaluateOwed: owedFromEnable,
    },
    failure: (cause, after, permission) =>
      new ContactsSyncAfterEnableError(
        cause,
        enabled,
        {
          ...after,
          // Fired below; only a write still in doubt stays owed.
          reevaluateOwed:
            isContactsOutcomeUncertain(cause.reason) || after.uncertainOp != null,
        },
        { permission, scheduleReevaluate: owedFromEnable },
      ),
  });
}

/**
 * The user's retry once enable is already confirmed: it does not repeat the enable.
 */
export async function runSyncRetry(input: {
  functions: ContactsHmacFunctionsPort;
  book: ContactsBookPort;
  state: ContactsLocalState;
  onStage?: (stage: ContactsEnableStage) => void;
  saveState?: ContactsStateSaver;
}): Promise<ContactsFlowOutcome> {
  return syncAfterConfirmedEnable({
    functions: input.functions,
    book: input.book,
    save: input.saveState ?? noSave,
    onStage: input.onStage,
    enableResult: null,
    state: input.state,
    failure: (cause, after, permission) =>
      new ContactsFlowStateError(cause, after, { permission }),
  });
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
    const synced = await uploadWithEpochRecovery({
      functions: input.functions,
      book: input.book,
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
  const intent = withDisableIntent(input.state);
  await (input.saveState ?? noSave)(intent);

  // A failed disable sets no barrier, so it stays pending instead of reverting.
  const failure = (err: unknown, known: ContactsLocalState) =>
    new ContactsFlowStateError(asHmacError(err), known);
  const finished = (result: ContactsWireResult): ContactsFlowOutcome => ({
    result,
    // Disable deletes Identity fences; the local floor resets with the new epoch.
    state: applyDisabled(
      intent,
      Math.max(result.contactsEpoch, intent.contactsEpoch),
    ),
    scheduleReevaluate: shouldScheduleReevaluate(result) || priorOwed,
    permission: null,
  });

  let firstError: unknown;
  try {
    return finished(
      await disableContactsSync(input.functions, intent.contactsEpoch),
    );
  } catch (err) {
    firstError = err;
  }
  if (
    !(firstError instanceof ContactsHmacError) ||
    firstError.reason !== 'contacts-epoch-mismatch'
  ) {
    throw failure(firstError, intent);
  }

  // Our epoch is old, e.g. an earlier uncertain disable did land. Ask Identity.
  let live: ContactsWireResult;
  try {
    live = await refreshVerifiedActorKeys(input.functions);
  } catch (err) {
    throw failure(err, { ...intent, epochStale: true });
  }
  if (!live.contactsSyncEnabled) return finished(live);
  // On at a later epoch: that may be a new activation from another device, which
  // this older request must not switch off by itself. It takes an explicit retry.
  throw failure(firstError, {
    ...withConfirmedEpoch(intent, live.contactsEpoch),
    uncertainOp: 'disable',
    enablementConfirmed: true,
  });
}

export async function runRefreshKeys(input: {
  functions: ContactsHmacFunctionsPort;
  state: ContactsLocalState;
}): Promise<ContactsFlowOutcome> {
  const refreshed = await refreshVerifiedActorKeys(input.functions);
  return {
    result: refreshed,
    state: applyLiveState(input.state, refreshed),
    scheduleReevaluate: shouldScheduleReevaluate(refreshed),
    permission: null,
  };
}
