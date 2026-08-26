/**
 * Reconcile Firestore user snapshots with a recently confirmed setActiveProfileMode
 * response so stale reads cannot temporarily revert mode/visibility.
 *
 * Confirmation is scoped to a single UID. A matching snapshot clears protection.
 * TTL is a safety net only — normal release is snapshot catch-up.
 */

import type { ProfileMode } from '../profile/profileModeFields';

/** Safety net if Firestore never reflects the callable before unmount/navigation. */
export const ACTIVE_PROFILE_MODE_CONFIRMATION_TTL_MS = 120_000;

export type ActiveProfileModeConfirmation = {
  uid: string;
  mode: ProfileMode;
  visibility: boolean;
  epoch: number;
  confirmedAt: number;
};

let lastConfirmation: ActiveProfileModeConfirmation | null = null;

function isConfirmationExpired(
  confirmation: ActiveProfileModeConfirmation,
  now = Date.now(),
): boolean {
  return now - confirmation.confirmedAt > ACTIVE_PROFILE_MODE_CONFIRMATION_TTL_MS;
}

/** Record authoritative mode switch confirmation (call after successful callable). */
export function recordActiveProfileModeConfirmation(input: {
  uid: string;
  mode: ProfileMode;
  visibility: boolean;
  confirmedAt?: number;
}): ActiveProfileModeConfirmation {
  const epoch = (lastConfirmation?.epoch ?? 0) + 1;
  lastConfirmation = {
    uid: input.uid,
    mode: input.mode,
    visibility: input.visibility,
    epoch,
    confirmedAt: input.confirmedAt ?? Date.now(),
  };
  return lastConfirmation;
}

/** Clear pending confirmation — call on logout or auth UID change. */
export function clearActiveProfileModeConfirmation(): void {
  lastConfirmation = null;
}

/** Test/reset hook. */
export function resetActiveProfileModeConfirmationForTests(): void {
  lastConfirmation = null;
}

export function getActiveProfileModeConfirmation(): ActiveProfileModeConfirmation | null {
  return lastConfirmation;
}

/**
 * Merge snapshot with pending confirmation when Firestore lags behind callable.
 * Only overrides `mode` and `visibility`; other fields pass through unchanged.
 */
export function reconcileUserDocWithActiveProfileMode<T extends Record<string, unknown>>(
  doc: T,
  uid: string,
  now = Date.now(),
): T {
  if (!lastConfirmation) return doc;
  if (lastConfirmation.uid !== uid) return doc;

  if (isConfirmationExpired(lastConfirmation, now)) {
    lastConfirmation = null;
    return doc;
  }

  const snapshotMode = doc.mode;
  const snapshotVisibility = doc.visibility;

  const caughtUp =
    snapshotMode === lastConfirmation.mode &&
    snapshotVisibility === lastConfirmation.visibility;

  if (caughtUp) {
    lastConfirmation = null;
    return doc;
  }

  return {
    ...doc,
    mode: lastConfirmation.mode,
    visibility: lastConfirmation.visibility,
  };
}
