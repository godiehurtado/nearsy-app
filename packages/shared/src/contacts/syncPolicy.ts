/**
 * OS Contacts denied → removeContactSource, never upload empty.
 * Empty granted book is a valid snapshot.
 * Idempotent Identity result is success; do not bump snapshotVersion.
 */

import type { ContactsPermissionStatus } from './port';
import type { ContactsWireResult } from './wireTypes';

export type ContactsPermissionAction = 'sync' | 'remove-source' | 'request';

export function decideContactsPermissionAction(
  status: ContactsPermissionStatus,
): ContactsPermissionAction {
  if (status === 'granted') return 'sync';
  if (status === 'undetermined') return 'request';
  return 'remove-source';
}

export function shouldBumpSnapshotVersionAfterSync(
  result: ContactsWireResult,
): boolean {
  return result.result !== 'idempotent' && result.result !== 'synced';
}

export function resetLocalSnapshotAfterWithdrawal(result: ContactsWireResult): boolean {
  return result.result === 'removed' || result.result === 'disabled';
}
