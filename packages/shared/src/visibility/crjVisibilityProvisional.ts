/**
 * BUG-VIS-01 — one-shot CRJ activate success → Home provisional Active.
 *
 * Session memory only (not AsyncStorage / Firestore). Survives the navigation
 * reset from ProfileCompletion → MainTabs so Home can paint Active before the
 * remote `visibility:true` snapshot arrives. Consumed once per uid.
 */

let pendingUid: string | null = null;

/** Call only after `attemptInitialVisibilityAfterCrjCompletion` returns activated. */
export function markCrjVisibilityProvisionalActive(uid: string): void {
  if (!uid) return;
  pendingUid = uid;
}

/** Peek without consuming (tests / diagnostics). */
export function peekCrjVisibilityProvisionalActive(uid: string): boolean {
  return !!uid && pendingUid === uid;
}

/**
 * Home mount: take ownership of the pending flag for this uid.
 * Remounts without a fresh mark see false → no sticky Active.
 */
export function consumeCrjVisibilityProvisionalActive(uid: string): boolean {
  if (!uid || pendingUid !== uid) return false;
  pendingUid = null;
  return true;
}

/** Logout / account switch / test reset. */
export function clearCrjVisibilityProvisionalActive(uid?: string): void {
  if (!uid || pendingUid === uid) {
    pendingUid = null;
  }
}
