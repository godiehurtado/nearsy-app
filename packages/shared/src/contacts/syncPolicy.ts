/**
 * OS Contacts denied → removeContactSource, never upload empty.
 * Empty granted book is a valid snapshot.
 * Idempotent Identity result is success; do not bump snapshotVersion.
 * After remove, keep monotonic snapshotVersion for the stable sourceId —
 * Identity fences snapshotVersion <= removedSnapshotVersion.
 */

import type { ContactsPermissionStatus } from './port';
import type { ContactsWireResult } from './wireTypes';

export type ContactsPermissionAction = 'sync' | 'remove-source' | 'request';

export function decideContactsPermissionAction(
  status: ContactsPermissionStatus,
): ContactsPermissionAction {
  if (status === 'granted' || status === 'limited') return 'sync';
  if (status === 'undetermined') return 'request';
  return 'remove-source';
}

export function shouldBumpSnapshotVersionAfterSync(
  result: ContactsWireResult,
): boolean {
  return result.result !== 'idempotent' && result.result !== 'synced';
}

/** Clear fingerprint only; never restart snapshotVersion at 1 for same sourceId. */
export function shouldClearFingerprintAfterWithdrawal(
  result: ContactsWireResult,
): boolean {
  return (
    result.result === 'removed' ||
    result.result === 'absent' ||
    result.result === 'disabled'
  );
}
