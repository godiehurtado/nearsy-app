import type { SocialProfileData } from '../domain/socialProfileData';

/**
 * In-memory one-shot prefill bridge (TS-008).
 * Survives AppNavigator remount that drops LoginScreen route params.
 * Never persists to AsyncStorage / Firestore.
 */
type PendingPrefill = {
  uid: string;
  socialProfile: SocialProfileData;
};

let pending: PendingPrefill | null = null;

export function setPendingSocialProfilePrefill(
  uid: string,
  socialProfile: SocialProfileData,
): void {
  if (!uid?.trim()) return;
  pending = { uid, socialProfile };
}

/**
 * Returns and clears pending prefill when uid matches.
 */
export function consumePendingSocialProfilePrefill(
  uid: string,
): SocialProfileData | null {
  if (!pending || pending.uid !== uid) {
    return null;
  }
  const value = pending.socialProfile;
  pending = null;
  return value;
}

export function clearPendingSocialProfilePrefill(): void {
  pending = null;
}

/** Test helper */
export function peekPendingSocialProfilePrefill(): PendingPrefill | null {
  return pending;
}
