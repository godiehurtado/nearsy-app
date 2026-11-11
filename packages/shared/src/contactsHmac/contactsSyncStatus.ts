/**
 * What the Contacts UI may claim, as separate facts: OS permission, the user's
 * consent, Identity enablement and the snapshot. None implies another.
 */
import type { ContactsErrorI18nKey } from './contactsHmacCore.ts';
import {
  withHigherEpoch,
  type ContactsEnableStage,
  type ContactsLocalState,
  type ContactsPermissionStatus,
} from './contactsSyncFlow.ts';

export type ContactsOperationKind =
  | 'enable'
  | 'disable'
  | 'reconcile'
  | 'refresh';

export type ContactsEnablement =
  | 'off'
  | 'enable_uncertain'
  | 'enabled'
  | 'disable_uncertain';

export type ContactsSnapshotStatus = 'none' | 'pending' | 'uncertain' | 'synced';

export type ContactsSyncStatus = {
  uid: string | null;
  /** False until a read of the account: then "off" would be a guess. */
  stateConfirmed: boolean;
  /** That read failed or took too long. Only an explicit retry reads again. */
  readFailed: boolean;
  /** A disable is running or unanswered: another one would be a duplicate. */
  disableInFlight: boolean;
  osPermission: ContactsPermissionStatus | 'unknown';
  consent: boolean;
  enablement: ContactsEnablement;
  snapshot: ContactsSnapshotStatus;
  /** Local flow running, if any. */
  operation: ContactsOperationKind | null;
  stage: ContactsEnableStage | null;
  /** A timed-out request has not settled yet: no duplicate may be sent. */
  awaitingLateResult: boolean;
  errorKey: ContactsErrorI18nKey | null;
  notifyEffective: boolean | null;
  /** Grows on every Identity result, so the UI can pick up late ones. */
  resultSeq: number;
  /** Effective identifier limit, for the limit copy ({{max}}); 500 when absent. */
  identifierLimit?: number;
};

export const CONTACTS_STATUS_SIGNED_OUT: ContactsSyncStatus = {
  uid: null,
  stateConfirmed: false,
  readFailed: false,
  disableInFlight: false,
  osPermission: 'unknown',
  consent: false,
  enablement: 'off',
  snapshot: 'none',
  operation: null,
  stage: null,
  awaitingLateResult: false,
  errorKey: null,
  notifyEffective: null,
  resultSeq: 0,
};

export function contactsEnablementFromState(
  state: ContactsLocalState,
): ContactsEnablement {
  if (state.uncertainOp === 'disable') return 'disable_uncertain';
  if (state.enablementConfirmed === true) return 'enabled';
  if (state.uncertainOp === 'enable') return 'enable_uncertain';
  return 'off';
}

export function contactsSnapshotFromState(
  state: ContactsLocalState,
): ContactsSnapshotStatus {
  if (state.enablementConfirmed !== true) return 'none';
  if (state.uncertainOp === 'sync') return 'uncertain';
  if (
    !state.pendingUpload &&
    state.lastAckedVersion != null &&
    state.lastAckedEpoch === state.contactsEpoch &&
    // At or under a removal fence the source may already be gone.
    state.lastAckedVersion > (state.removedSnapshotFloor ?? 0) &&
    // A newer attempt was refused: this book is not the one on Identity.
    state.lastAckedVersion >= (state.highestAttemptedVersion ?? 0)
  ) {
    return 'synced';
  }
  return 'pending';
}

/**
 * Merge a read of users/{uid}. The epoch only grows, so an older read is stale;
 * and at the same epoch a cached "off" cannot undo what a callable just confirmed.
 * A read raises the epoch but does not confirm it: only an Identity success does.
 * A missing field (null) says nothing about the epoch.
 */
export function mergeUserDocIntoState(
  state: ContactsLocalState,
  doc: { contactsSyncEnabled: boolean; contactsEpoch: number | null },
): ContactsLocalState {
  const docEpoch = doc.contactsEpoch ?? state.contactsEpoch;
  if (docEpoch < state.contactsEpoch) return state;
  const newerEpoch = docEpoch > state.contactsEpoch;
  const next = withHigherEpoch(state, docEpoch);
  if (newerEpoch) next.epochConfirmed = false;

  if (doc.contactsSyncEnabled) {
    next.enablementConfirmed = true;
    if (state.uncertainOp === 'enable') next.uncertainOp = null;
    return next;
  }
  // A disable that landed moves the epoch. Off at the same epoch settles it only if
  // Identity never confirmed this on: otherwise it may be a cached read.
  if (
    newerEpoch ||
    (state.uncertainOp === 'disable' && state.enablementConfirmed !== true)
  ) {
    // Off, at an epoch newer than anything pending here: all of it is cancelled.
    next.enablementConfirmed = false;
    next.userConsent = false;
    next.uncertainOp = null;
    next.pendingUpload = null;
    return next;
  }
  if (state.uncertainOp !== 'enable' && state.enablementConfirmed !== true) {
    next.enablementConfirmed = false;
  }
  return next;
}

/**
 * Toggle position: what is being asked for while a flow runs, otherwise the last
 * state Identity confirmed. An unknown result is never drawn as its hoped-for
 * outcome; the description says it is unknown, and tapping asks for it again.
 */
export function contactsToggleValue(status: ContactsSyncStatus): boolean {
  if (status.operation === 'enable') return true;
  if (status.operation === 'disable') return false;
  return (
    status.enablement === 'enabled' || status.enablement === 'disable_uncertain'
  );
}

export function contactsOperationInFlight(status: ContactsSyncStatus): boolean {
  return status.operation != null || status.awaitingLateResult;
}

/** Turning off stays available during a flow: it cancels that flow. */
export function contactsToggleLocked(status: ContactsSyncStatus): boolean {
  if (!status.stateConfirmed || status.disableInFlight) return true;
  return contactsOperationInFlight(status) && !contactsToggleValue(status);
}

export function contactsCanRetry(status: ContactsSyncStatus): boolean {
  if (!status.stateConfirmed || contactsOperationInFlight(status)) return false;
  if (status.enablement === 'off') return false;
  return status.enablement !== 'enabled' || status.snapshot !== 'synced';
}

/** Reading the account again: never an enable, a sync or a permission prompt. */
export function contactsCanRetryRead(status: ContactsSyncStatus): boolean {
  return !status.stateConfirmed && status.readFailed;
}

/** Failures that leave the current book unsent and need more than a plain retry. */
const BOOK_NOT_SENT_ERRORS = new Set<ContactsErrorI18nKey>([
  'identifierCap',
  'unionCap',
  'identifierInvalid',
  'sourceCap',
]);

/** Values for the copy that names the limit. */
export function contactsCopyParams(status: ContactsSyncStatus): { max: number } {
  return { max: status.identifierLimit ?? 500 };
}

/** Relative i18n key under settings.contactsSync; null keeps the description. */
export function contactsStatusCopyKey(
  status: ContactsSyncStatus,
): string | null {
  if (status.operation === 'disable') return 'status.disabling';
  if (status.operation === 'enable' || status.operation === 'reconcile') {
    return `status.${status.stage ?? 'syncing'}`;
  }
  if (status.awaitingLateResult) return 'status.awaitingResult';
  if (!status.stateConfirmed) {
    return status.readFailed ? 'status.readFailed' : 'status.confirming';
  }

  switch (status.enablement) {
    case 'off':
      return status.errorKey ? `errors.${status.errorKey}` : null;
    case 'enable_uncertain':
      return status.errorKey === 'resultUnknown'
        ? 'errors.resultUnknown'
        : 'status.enableUncertain';
    case 'disable_uncertain':
      return status.errorKey === 'epochMismatch'
        ? 'errors.epochMismatch'
        : 'status.disableUncertain';
    case 'enabled':
      break;
  }
  // This book was not sent: an earlier snapshot is not "your contacts are synced".
  if (status.errorKey && BOOK_NOT_SENT_ERRORS.has(status.errorKey)) {
    return `errors.${status.errorKey}`;
  }
  if (status.errorKey === 'rateLimited') {
    return status.snapshot === 'synced'
      ? 'errors.rateLimited'
      : 'status.enabledRateLimited';
  }
  if (status.snapshot === 'synced') return 'status.synced';
  if (status.snapshot === 'uncertain') return 'status.syncUncertain';
  if (status.osPermission === 'denied') return 'status.enabledPermissionDenied';
  if (status.osPermission === 'undetermined') {
    return 'status.enabledPermissionNeeded';
  }
  return 'status.enabledPendingSync';
}
