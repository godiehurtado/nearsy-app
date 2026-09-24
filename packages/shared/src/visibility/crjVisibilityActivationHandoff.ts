/**
 * BUG-VIS-01 — session CRJ visibility handoff (activation_pending before Home).
 *
 * Causal order: mark pending for uid → THEN persist profileSetupCompleted
 * (which remounts AppNavigator auth-complete → auth-main). Home peeks pending
 * synchronously on first render so the first paint is Active provisional.
 *
 * Cleared on activation failure, FG/validation deny, logout, uid mismatch.
 * Never enables runtime by itself. Not persisted across process restarts.
 */

export type CrjVisibilityHandoffPhase = 'pending' | 'succeeded';

type HandoffSession = {
  uid: string;
  phase: CrjVisibilityHandoffPhase;
  epoch: number;
};

let session: HandoffSession | null = null;
let nextEpoch = 1;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listeners must not break mark/clear.
    }
  }
}

/** Redacted __DEV__ diagnostics — no uid/tokens/coords. */
export function logBugVis01Dev(
  event: string,
  fields?: Record<string, string | boolean | number | null | undefined>,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const parts: string[] = [`[BUG-VIS-01] ${event}`];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      parts.push(`${key}=${String(value)}`);
    }
  }
  console.log(parts.join(' '));
}

/**
 * Call synchronously BEFORE persisting profileSetupCompleted=true so Home's
 * first render already peeks Active provisional.
 */
export function markCrjVisibilityActivationPending(uid: string): void {
  const next = String(uid ?? '').trim();
  if (!next) return;
  session = { uid: next, phase: 'pending', epoch: nextEpoch++ };
  logBugVis01Dev('activation_pending', { epoch: session.epoch });
  notify();
}

/**
 * After activateVisibility succeeds — keep provisional until snapshot+FG confirm.
 * Safe if pending was already marked; re-arms if missing (defensive).
 */
export function confirmCrjVisibilityActivationHandoff(uid: string): void {
  const next = String(uid ?? '').trim();
  if (!next) return;
  if (session && session.uid === next) {
    session = { ...session, phase: 'succeeded' };
  } else {
    session = { uid: next, phase: 'succeeded', epoch: nextEpoch++ };
  }
  logBugVis01Dev('handoff_marked', {
    epoch: session.epoch,
    phase: session.phase,
  });
  notify();
}

/** @deprecated Use confirmCrjVisibilityActivationHandoff. */
export function armCrjVisibilityActivationHandoff(uid: string): void {
  confirmCrjVisibilityActivationHandoff(uid);
}

/** True while pending or succeeded for this uid (visual provisional). */
export function isCrjVisibilityActivationHandoffArmed(
  uid: string | null | undefined,
): boolean {
  const current = String(uid ?? '').trim();
  if (!current || !session) return false;
  return session.uid === current;
}

export function getCrjVisibilityActivationHandoffPhase(
  uid: string | null | undefined,
): CrjVisibilityHandoffPhase | null {
  if (!isCrjVisibilityActivationHandoffArmed(uid) || !session) return null;
  return session.phase;
}

export function getCrjVisibilityActivationHandoffEpoch(): number {
  return session?.epoch ?? 0;
}

/**
 * Bind handoff to the current auth uid. Clears on logout or uid mismatch.
 * Returns whether provisional is active for this uid.
 */
export function syncCrjVisibilityActivationHandoffForUid(
  uid: string | null | undefined,
): boolean {
  if (!session) return false;
  const current = String(uid ?? '').trim();
  if (!current) {
    clearCrjVisibilityActivationHandoff('logout');
    return false;
  }
  if (session.uid !== current) {
    clearCrjVisibilityActivationHandoff('uid_mismatch');
    return false;
  }
  return true;
}

export function clearCrjVisibilityActivationHandoff(
  reason:
    | 'validated'
    | 'denied'
    | 'logout'
    | 'uid_mismatch'
    | 'test_reset' = 'validated',
): void {
  if (!session) return;
  session = null;
  logBugVis01Dev('handoff_cleared', { reason });
  notify();
}

export function subscribeCrjVisibilityActivationHandoff(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helpers — do not use in product UI. */
export function peekCrjVisibilityActivationHandoffForTests(): boolean {
  return session !== null;
}

export function peekCrjVisibilityActivationHandoffPhaseForTests(): CrjVisibilityHandoffPhase | null {
  return session?.phase ?? null;
}

export function peekCrjVisibilityActivationHandoffUidForTests(): string | null {
  return session?.uid ?? null;
}

export function resetCrjVisibilityActivationHandoffForTests(): void {
  session = null;
}
