/**
 * Soft phase progress for CRJ — no step totals, no n/N labels.
 * Interest category screens share one flat progress value so the bar
 * does not reveal remaining category count.
 */
export type CrjProgressPhase =
  | 'auth'
  | 'type'
  | 'identity'
  | 'photo'
  | 'details'
  | 'interests'
  | 'affiliations'
  | 'location'
  | 'notifications';

const PHASE_PROGRESS: Record<CrjProgressPhase, number> = {
  auth: 0.12,
  type: 0.22,
  identity: 0.32,
  photo: 0.4,
  details: 0.48,
  interests: 0.58,
  affiliations: 0.68,
  location: 0.78,
  notifications: 0.88,
};

/** Auth sub-steps nudge slightly within the auth band without exposing totals. */
export function authPhaseProgress(stepIndex: number, stepCount: number): number {
  const base = 0.06;
  const span = 0.12;
  if (stepCount <= 1) return base + span;
  const t = Math.min(1, Math.max(0, stepIndex / (stepCount - 1)));
  return base + span * t;
}

export function crjPhaseProgress(phase: CrjProgressPhase): number {
  return PHASE_PROGRESS[phase];
}
