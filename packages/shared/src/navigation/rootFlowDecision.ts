/**
 * Pure root-flow decisions for AppNavigator (RN-free so Node tests cover them).
 * Both account-deletion barriers win over the Profile Gate: a uid whose
 * account was deleted, or whose deletion is unresolved, never reaches
 * OnboardingBirthDate / CompleteProfile.
 */
import type { AccountDeletionClosure } from '../services/accountDeletionSession';
import type { PendingAccountDeletion } from '../services/accountDeletionReconciliation';

export type RootFlowKind =
  | 'loading'
  | 'guest'
  | 'deletion-pending'
  | 'auth-complete'
  | 'auth-main';

function closesUid(closure: AccountDeletionClosure | null, uid: string | null): boolean {
  return !!uid && closure?.uid === uid;
}

function pendingForUid(pending: PendingAccountDeletion | null, uid: string | null): boolean {
  return !!uid && pending?.uid === uid;
}

export function resolveRootFlowKind(input: {
  loading: boolean;
  uid: string | null;
  needsCompleteProfile: boolean;
  closure: AccountDeletionClosure | null;
  pending?: PendingAccountDeletion | null;
}): RootFlowKind {
  if (input.loading) return 'loading';
  if (closesUid(input.closure, input.uid)) {
    return input.closure!.phase === 'closing' ? 'loading' : 'guest';
  }
  if (pendingForUid(input.pending ?? null, input.uid)) return 'deletion-pending';
  if (!input.uid) return 'guest';
  return input.needsCompleteProfile ? 'auth-complete' : 'auth-main';
}

/** The profile listener never subscribes to a closed or unresolved account. */
export function resolveProfileSubscriptionUid(
  uid: string | null,
  closure: AccountDeletionClosure | null,
  pending: PendingAccountDeletion | null = null,
): string | null {
  return closesUid(closure, uid) || pendingForUid(pending, uid) ? null : uid;
}
