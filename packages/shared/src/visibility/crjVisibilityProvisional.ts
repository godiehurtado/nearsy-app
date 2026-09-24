/**
 * BUG-VIS-01 — CRJ Visibility presentation session (in-memory, uid-scoped).
 *
 * Arm `activation_pending` BEFORE writing profileSetupCompleted=true so the
 * profile-gate listener can mount Home while activateVisibility is still in
 * flight — Home must paint Active provisional on the first relevant render.
 *
 * Do NOT consume-on-mount (Strict Mode / premature mount would lose the signal).
 * Clear only on conclusive outcomes or logout/uid change.
 */

export type CrjVisibilitySessionPhase =
  | 'none'
  | 'activation_pending'
  | 'activation_succeeded';

type Listener = () => void;

let phase: CrjVisibilitySessionPhase = 'none';
let uid: string | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeCrjVisibilitySession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCrjVisibilitySessionPhase(
  forUid: string,
): CrjVisibilitySessionPhase {
  if (!forUid || uid !== forUid) return 'none';
  return phase;
}

/** True while Home should show Active provisional (pending or succeeded). */
export function isCrjVisibilityProvisional(forUid: string): boolean {
  const p = getCrjVisibilitySessionPhase(forUid);
  return p === 'activation_pending' || p === 'activation_succeeded';
}

/**
 * Arm before profileSetupCompleted=true / before navigation can show Home.
 * Re-arming same uid from none/pending stays pending.
 */
export function armCrjVisibilityActivationPending(forUid: string): void {
  if (!forUid) return;
  uid = forUid;
  phase = 'activation_pending';
  notify();
}

/** After activateVisibility success — keep provisional until remote/FG conclude. */
export function markCrjVisibilityActivationSucceeded(forUid: string): void {
  if (!forUid) return;
  if (uid && uid !== forUid) return;
  uid = forUid;
  phase = 'activation_succeeded';
  notify();
}

/** Activation failure, FG denied conclusive, logout, or confirmed settle. */
export function clearCrjVisibilitySession(forUid?: string): void {
  if (forUid && uid && uid !== forUid) return;
  phase = 'none';
  uid = null;
  notify();
}

/** @deprecated Prefer isCrjVisibilityProvisional / getCrjVisibilitySessionPhase */
export function peekCrjVisibilityProvisionalActive(forUid: string): boolean {
  return isCrjVisibilityProvisional(forUid);
}

/** @deprecated Prefer clearCrjVisibilitySession — do not consume on mount. */
export function consumeCrjVisibilityProvisionalActive(forUid: string): boolean {
  const had = isCrjVisibilityProvisional(forUid);
  // Intentionally non-destructive: remount / Strict Mode must not drop pending.
  return had;
}

/** @deprecated Prefer markCrjVisibilityActivationSucceeded */
export function markCrjVisibilityProvisionalActive(forUid: string): void {
  markCrjVisibilityActivationSucceeded(forUid);
}

/** @deprecated Prefer clearCrjVisibilitySession */
export function clearCrjVisibilityProvisionalActive(forUid?: string): void {
  clearCrjVisibilitySession(forUid);
}

/** Test helper */
export function resetCrjVisibilitySessionForTests(): void {
  phase = 'none';
  uid = null;
  listeners.clear();
}
