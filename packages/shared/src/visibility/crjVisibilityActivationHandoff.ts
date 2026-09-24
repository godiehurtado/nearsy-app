/**
 * BUG-VIS-01 — session-scoped CRJ activation handoff → Home presentation.
 *
 * Not consume-on-mount: AppNavigator remounts MainTabs when profileSetupCompleted
 * flips (auth-complete → auth-main), so a one-shot consume is lost or fires too early.
 *
 * Armed after activateVisibility succeeds; Home peeks + subscribes. Cleared only on
 * conclusive validation, logout, or uid mismatch. Never enables runtime by itself.
 */

type HandoffSession = {
  uid: string;
};

let session: HandoffSession | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listeners must not break arm/clear.
    }
  }
}

function logDev(message: string, extra?: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Redacted — no uid/tokens/coords.
    console.log(`[BUG-VIS-01] ${message}`, extra ?? {});
  }
}

/** Call only after activateVisibility succeeds during CRJ finishOnboarding. */
export function armCrjVisibilityActivationHandoff(uid: string): void {
  const next = String(uid ?? '').trim();
  if (!next) return;
  session = { uid: next };
  logDev('handoff_armed');
  notify();
}

/** Peek without clearing — safe across remounts / Strict Mode. */
export function isCrjVisibilityActivationHandoffArmed(
  uid: string | null | undefined,
): boolean {
  const current = String(uid ?? '').trim();
  if (!current || !session) return false;
  return session.uid === current;
}

/**
 * Bind handoff to the current auth uid. Clears on logout or uid mismatch.
 * Returns whether the handoff is armed for this uid.
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

/**
 * Clear provisional handoff (validation concluded, logout, uid change).
 * Idempotent.
 */
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
  logDev('handoff_cleared', { reason });
  notify();
}

/** Subscribe to arm/clear. Returns unsubscribe. */
export function subscribeCrjVisibilityActivationHandoff(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @deprecated Prefer isCrjVisibilityActivationHandoffArmed (non-consuming). */
export function consumeCrjVisibilityActivationHandoff(): boolean {
  if (!session) return false;
  // Do not clear — remount-safe. Callers that still "consume" only peek.
  return true;
}

/** Test helpers — do not use in product UI. */
export function peekCrjVisibilityActivationHandoffForTests(): boolean {
  return session !== null;
}

export function peekCrjVisibilityActivationHandoffUidForTests(): string | null {
  return session?.uid ?? null;
}

export function resetCrjVisibilityActivationHandoffForTests(): void {
  session = null;
  // Do not notify in tests unless needed — keep deterministic.
}
