/**
 * ENH-LOC-01 — journey session: mutex + state machine singleton.
 * Pure decisions + process-level state (no RN imports).
 */

import {
  createInitialLocationJourneyState,
  deriveJourneyPresentation,
  deriveVisibilityToggleDisabled,
  isTerminalJourneyPhase,
  reduceLocationJourney,
  type LocationJourneyEvent,
  type LocationJourneyOwner,
  type LocationJourneyState,
  type LocationJourneyPhase,
} from './locationPermissionJourneyMachine';

export type LocationJourneySource =
  | 'crj'
  | 'home-activate'
  | 'home-recovery'
  | 'more'
  | 'bootstrap';

export type LocationJourneyToken = string;

export {
  canAdvanceNavigation,
  canPresentActivationIssue,
  canPresentSettingsAlert,
  deriveJourneyPresentation,
  deriveVisibilityToggleDisabled,
  eventBelongsToOwner,
  isTerminalJourneyPhase,
  mapCrjActivationReasonToResult,
  shouldUseLocationNotEnabledCopy,
  LOCATION_JOURNEY_OWNER_PRIORITY,
  type ActivationJourneyResult,
  type JourneyPresentationKind,
  type LocationJourneyEvent,
  type LocationJourneyOwner,
  type LocationJourneyPhase,
  type LocationJourneyState,
} from './locationPermissionJourneyMachine';

let machine: LocationJourneyState = createInitialLocationJourneyState();

function sourceToOwner(source: LocationJourneySource): LocationJourneyOwner {
  if (source === 'crj') return 'crj';
  if (source === 'bootstrap') return 'bootstrap';
  if (source === 'more') return 'more';
  return 'home';
}

export function getLocationJourneyState(): LocationJourneyState {
  return machine;
}

export function dispatchLocationJourney(
  event: LocationJourneyEvent,
): LocationJourneyState {
  machine = reduceLocationJourney(machine, event);
  return machine;
}

/**
 * Boot reconciliation: clear ephemeral journey locks; never persist locks.
 */
export function reconcileLocationJourneyOnColdStart(): void {
  machine = createInitialLocationJourneyState();
}

export function beginLocationPermissionJourney(
  uid: string,
  source: LocationJourneySource,
): LocationJourneyToken | null {
  const trimmed = uid.trim();
  if (!trimmed) return null;
  if (!isTerminalJourneyPhase(machine.phase) && machine.owner) {
    return null;
  }
  const owner = sourceToOwner(source);
  const token = `${trimmed}:${owner}:${Date.now()}`;
  dispatchLocationJourney({
    type: 'START',
    owner,
    uidFingerprint: trimmed,
    token,
  });
  if (machine.token !== token) return null;
  return token;
}

export function isLocationPermissionJourneyActive(
  token?: LocationJourneyToken | null,
): boolean {
  if (isTerminalJourneyPhase(machine.phase) || !machine.owner) return false;
  if (token) return machine.token === token;
  return true;
}

export function endLocationPermissionJourney(
  token: LocationJourneyToken | null | undefined,
): void {
  if (!token || machine.token !== token) return;
  if (!isTerminalJourneyPhase(machine.phase)) {
    dispatchLocationJourney({ type: 'COMPLETE' });
  } else {
    // Already terminal — drop owner fields if CLEAR not used
    dispatchLocationJourney({ type: 'COMPLETE' });
  }
}

export function cancelLocationPermissionJourneyForUid(uid: string): void {
  const trimmed = uid.trim();
  if (machine.uidFingerprint && machine.uidFingerprint === trimmed) {
    dispatchLocationJourney({ type: 'CANCEL' });
  }
}

export function clearLocationPermissionJourneySession(): void {
  dispatchLocationJourney({ type: 'CLEAR_SESSION' });
}

export function markSessionBackgroundEducationOffered(uid: string): void {
  const trimmed = uid.trim();
  if (!trimmed) return;
  if (machine.uidFingerprint && machine.uidFingerprint !== trimmed) return;
  dispatchLocationJourney({ type: 'MARK_EDUCATION_OFFERED' });
}

export function hasSessionBackgroundEducationOffered(uid: string): boolean {
  return (
    machine.educationOfferedThisSession === true &&
    (!machine.uidFingerprint || machine.uidFingerprint === uid.trim())
  );
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
 * Activation success/failure is independent.
 */
export function shouldContinueToBackgroundEducation(input: {
  foregroundGranted: boolean;
  uid: string;
  alreadyOfferedThisSession: boolean;
  requireNewlyGranted: boolean;
  foregroundNewlyGranted: boolean;
}): boolean {
  if (!input.foregroundGranted || input.alreadyOfferedThisSession) return false;
  if (!input.uid.trim()) return false;
  if (input.requireNewlyGranted && !input.foregroundNewlyGranted) return false;
  return true;
}

export function getActiveJourneyPresentation() {
  return deriveJourneyPresentation(machine);
}

export function getVisibilityToggleDisabledFromJourney(): boolean {
  return deriveVisibilityToggleDisabled(machine);
}
