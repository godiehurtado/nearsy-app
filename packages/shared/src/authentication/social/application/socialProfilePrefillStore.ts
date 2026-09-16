import type { SocialProfileData } from '../domain/socialProfileData';
import type { AppliedSocialNamePrefill } from './resolveCrjNamePrefill';

/**
 * In-memory social prefill bridge (TS-008 / CRJ).
 *
 * Survives AppNavigator remounts that drop Login route params.
 * Soft-retains after read until commit/clear so Name-step apply can run
 * even when ProfileCompletion mounted before pending was written.
 * Never persists to AsyncStorage / Firestore.
 */
type PendingPrefill = {
  uid: string;
  socialProfile: SocialProfileData;
};

let pending: PendingPrefill | null = null;

/** Remount-safe snapshot after pending was consumed at the Name step. */
let appliedNamePrefill: AppliedSocialNamePrefill | null = null;

export function setPendingSocialProfilePrefill(
  uid: string,
  socialProfile: SocialProfileData,
): void {
  if (!uid?.trim()) return;
  pending = { uid, socialProfile };
  if (appliedNamePrefill && appliedNamePrefill.uid !== uid) {
    appliedNamePrefill = null;
  }
}

/**
 * Returns pending prefill when uid matches.
 * Soft-retains until commitPendingSocialNamePrefill / clear.
 */
export function consumePendingSocialProfilePrefill(
  uid: string,
): SocialProfileData | null {
  if (!pending || pending.uid !== uid) return null;
  return pending.socialProfile;
}

/**
 * After Name-step state received the prefill: clear pending once and retain
 * a remount snapshot for the same uid.
 */
export function commitPendingSocialNamePrefill(
  snapshot: AppliedSocialNamePrefill,
): void {
  if (!snapshot.uid?.trim()) return;
  appliedNamePrefill = {
    uid: snapshot.uid,
    firstName: snapshot.firstName,
    lastName: snapshot.lastName,
  };
  pending = null;
}

export function peekAppliedSocialNamePrefill(): AppliedSocialNamePrefill | null {
  return appliedNamePrefill;
}

export function clearPendingSocialProfilePrefill(): void {
  pending = null;
  appliedNamePrefill = null;
}

/** Test / diagnostics helper */
export function peekPendingSocialProfilePrefill(): PendingPrefill | null {
  return pending;
}
