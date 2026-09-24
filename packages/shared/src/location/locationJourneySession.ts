/**
 * Session-scoped location journey coordination (no artificial delays).
 * Prevents duplicate FG→disclosure prompts across App bootstrap + Home focus.
 */

import { clearCrjVisibilitySession } from '../visibility/crjVisibilityProvisional.ts';

export type LocationJourneySource =
  | 'crj'
  | 'home-visibility'
  | 'home-recovery'
  | 'more'
  | 'post-login';

type SessionState = {
  uid: string | null;
  disclosureOffered: boolean;
  journeyInFlight: boolean;
  preparing: boolean;
  postLoginRecoveryUid: string | null;
};

const session: SessionState = {
  uid: null,
  disclosureOffered: false,
  journeyInFlight: false,
  preparing: false,
  postLoginRecoveryUid: null,
};

export function resetLocationJourneySession(): void {
  session.uid = null;
  session.disclosureOffered = false;
  session.journeyInFlight = false;
  session.preparing = false;
  session.postLoginRecoveryUid = null;
  // Avoid sticky CRJ provisional Active across logout / account switch.
  clearCrjVisibilitySession();
}

export function bindLocationJourneySessionUid(uid: string | null): void {
  if (!uid) {
    resetLocationJourneySession();
    return;
  }
  if (session.uid && session.uid !== uid) {
    resetLocationJourneySession();
  }
  session.uid = uid;
}

export function wasBackgroundDisclosureOfferedThisSession(): boolean {
  return session.disclosureOffered;
}

export function markBackgroundDisclosureOfferedThisSession(): void {
  session.disclosureOffered = true;
}

export function isLocationJourneyInFlight(): boolean {
  return session.journeyInFlight;
}

export function beginLocationJourney(): boolean {
  if (session.journeyInFlight) return false;
  session.journeyInFlight = true;
  return true;
}

export function endLocationJourney(): void {
  session.journeyInFlight = false;
  session.preparing = false;
}

export function setLocationJourneyPreparing(value: boolean): void {
  session.preparing = value;
}

export function isLocationJourneyPreparing(): boolean {
  return session.preparing;
}

/**
 * Whether preparation UI should become visible for the elapsed async work.
 * No artificial delay — returns false for near-instant work (avoids flash).
 */
export function shouldRenderPreparationForElapsedMs(
  elapsedMs: number,
  minVisibleMs: number = 80,
): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= minVisibleMs;
}

/**
 * After a *new* foreground grant, continue into background education
 * unless already offered this session for this uid.
 */
export function shouldOfferBackgroundDisclosureAfterFgGrant(input: {
  backgroundAlreadyGranted: boolean;
  disclosureOfferedThisSession: boolean;
}): boolean {
  if (input.backgroundAlreadyGranted) return false;
  if (input.disclosureOfferedThisSession) return false;
  return true;
}

export function markPostLoginLocationRecoveryNeeded(uid: string): void {
  session.postLoginRecoveryUid = uid;
}

export function consumePostLoginLocationRecovery(uid: string): boolean {
  if (!uid || session.postLoginRecoveryUid !== uid) return false;
  session.postLoginRecoveryUid = null;
  return true;
}

export function peekPostLoginLocationRecovery(uid: string): boolean {
  return !!uid && session.postLoginRecoveryUid === uid;
}
