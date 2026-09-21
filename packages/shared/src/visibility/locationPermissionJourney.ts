/**
 * ENH-LOC-01 — single-flight location permission journey coordinator.
 * Pure decisions + process-level mutex/session guards (no RN imports).
 */

export type LocationJourneySource =
  | 'crj'
  | 'home-activate'
  | 'home-recovery'
  | 'more';

export type LocationJourneyToken = string;

let activeToken: LocationJourneyToken | null = null;
/** UID for which full/brief BG education was already offered this process session. */
let sessionEducationOfferedUid: string | null = null;
/** UID that owns the active journey (for account-switch cancel). */
let activeJourneyUid: string | null = null;

export function beginLocationPermissionJourney(
  uid: string,
  source: LocationJourneySource,
): LocationJourneyToken | null {
  const trimmed = uid.trim();
  if (!trimmed) return null;
  if (activeToken) return null;
  const token = `${trimmed}:${source}:${Date.now()}`;
  activeToken = token;
  activeJourneyUid = trimmed;
  return token;
}

export function isLocationPermissionJourneyActive(
  token?: LocationJourneyToken | null,
): boolean {
  if (!activeToken) return false;
  if (token) return activeToken === token;
  return true;
}

export function endLocationPermissionJourney(
  token: LocationJourneyToken | null | undefined,
): void {
  if (!token || activeToken !== token) return;
  activeToken = null;
  activeJourneyUid = null;
}

export function cancelLocationPermissionJourneyForUid(uid: string): void {
  const trimmed = uid.trim();
  if (activeJourneyUid && activeJourneyUid === trimmed) {
    activeToken = null;
    activeJourneyUid = null;
  }
}

export function clearLocationPermissionJourneySession(): void {
  activeToken = null;
  activeJourneyUid = null;
  sessionEducationOfferedUid = null;
}

export function markSessionBackgroundEducationOffered(uid: string): void {
  const trimmed = uid.trim();
  if (trimmed) sessionEducationOfferedUid = trimmed;
}

export function hasSessionBackgroundEducationOffered(uid: string): boolean {
  return sessionEducationOfferedUid === uid.trim();
}

/**
 * Preparation overlay while real activation work runs after FG is confirmed.
 * No artificial minimum duration — caller closes when work finishes.
 */
export function shouldShowLocationPreparation(input: {
  foregroundGranted: boolean;
  willRunActivationWork: boolean;
}): boolean {
  return (
    input.foregroundGranted === true && input.willRunActivationWork === true
  );
}

/**
 * BG education after effective foreground is granted in this journey.
 *
 * Contractual activateVisibility success/failure is independent — network,
 * callable, App Check, accuracy, or backend errors must not skip education.
 * Home recovery may still require a new FG grant this attempt.
 */
export function shouldContinueToBackgroundEducation(input: {
  /** Effective foreground permission is granted. */
  foregroundGranted: boolean;
  uid: string;
  alreadyOfferedThisSession: boolean;
  /** When true, only continue if FG was newly granted this attempt. */
  requireNewlyGranted: boolean;
  foregroundNewlyGranted: boolean;
}): boolean {
  if (!input.foregroundGranted || input.alreadyOfferedThisSession) return false;
  if (!input.uid.trim()) return false;
  if (input.requireNewlyGranted && !input.foregroundNewlyGranted) return false;
  return true;
}
