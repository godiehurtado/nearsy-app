/**
 * Pure root-flow decisions for AppNavigator (RN-free so Node tests cover them).
 * The account-closure barrier wins over the Profile Gate: a uid whose account
 * was just deleted never reaches OnboardingBirthDate / CompleteProfile.
 */
import type { AccountDeletionClosure } from '../services/accountDeletionSession';

export type RootFlowKind = 'loading' | 'guest' | 'auth-complete' | 'auth-main';

function closesUid(closure: AccountDeletionClosure | null, uid: string | null): boolean {
  return !!uid && closure?.uid === uid;
}

export function resolveRootFlowKind(input: {
  loading: boolean;
  uid: string | null;
  needsCompleteProfile: boolean;
  closure: AccountDeletionClosure | null;
}): RootFlowKind {
  if (input.loading) return 'loading';
  if (closesUid(input.closure, input.uid)) {
    return input.closure!.phase === 'closing' ? 'loading' : 'guest';
  }
  if (!input.uid) return 'guest';
  return input.needsCompleteProfile ? 'auth-complete' : 'auth-main';
}

/** The profile listener never subscribes to a closed account. */
export function resolveProfileSubscriptionUid(
  uid: string | null,
  closure: AccountDeletionClosure | null,
): string | null {
  return closesUid(closure, uid) ? null : uid;
}