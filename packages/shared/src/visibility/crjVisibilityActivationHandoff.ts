/**
 * BUG-VIS-01 — one-shot handoff from successful CRJ activateVisibility → Home.
 *
 * In-memory only: armed on CRJ success, consumed once on Home mount.
 * Survives neither remount nor process restart. Never enables runtime by itself.
 */

let armed = false;

/** Call only after activateVisibility succeeds during CRJ finishOnboarding. */
export function armCrjVisibilityActivationHandoff(): void {
  armed = true;
}

/**
 * Consume the handoff (clears immediately). Home must keep a mount-scoped ref
 * so a cached visibility=false snapshot does not paint Inactive before remote true.
 */
export function consumeCrjVisibilityActivationHandoff(): boolean {
  if (!armed) return false;
  armed = false;
  return true;
}

/** Test helpers — do not use in product UI. */
export function peekCrjVisibilityActivationHandoffForTests(): boolean {
  return armed;
}

export function resetCrjVisibilityActivationHandoffForTests(): void {
  armed = false;
}
