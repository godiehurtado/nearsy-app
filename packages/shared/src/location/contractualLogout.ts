/**
 * Contractual Android logout sequence (ENH-LOC-01).
 * Injectable deps keep Node unit tests free of RNFirebase / Expo.
 *
 * Order:
 * 1. clear social prefill
 * 2. close the publication gate (invalidates every in-flight ticket)
 * 3. stop + unregister FGS/task (+ clear NEARSY_BG_UID / runtime auth)
 * 4. wait (bounded) for publishLocation calls already sent
 * 5. sign out native provider sessions (Facebook), best effort
 * 6. unregister this device's push token under the outgoing UID
 * 7. signOut
 * Navigation reset remains the caller's responsibility.
 *
 * Logout never writes Visibility: the persisted preference belongs to the
 * account and must survive the session so the next login restores it.
 * Presence expires server-side through the confirmedAt TTL.
 */

export type ContractualLogoutDeps = {
  clearSocialPrefill: () => void;
  closePublicationGate: () => void;
  stopBackground: () => Promise<void>;
  drainInFlightPublications: () => Promise<unknown>;
  /** Idempotent native provider logout; failures never block Firebase signOut. */
  signOutProviderSessions?: () => void | Promise<void>;
  /**
   * Drop this device's push token while the outgoing Firebase session is still
   * valid. Optional so iOS callers keep the previous sequence.
   */
  unregisterDevicePush?: () => void | Promise<void>;
  signOut: () => Promise<void>;
};

export async function runContractualAndroidLogout(
  deps: ContractualLogoutDeps,
): Promise<void> {
  deps.clearSocialPrefill();
  deps.closePublicationGate();
  await deps.stopBackground().catch(() => {});
  await deps.drainInFlightPublications().catch(() => {});
  try {
    await deps.signOutProviderSessions?.();
  } catch {
    // Best effort; Firebase signOut below is the contractual step.
  }
  try {
    await deps.unregisterDevicePush?.();
  } catch {
    // Best effort; must not block signOut if Firestore is already gone.
  }
  await deps.signOut();
}

/**
 * Preferencia bgVisible vs permiso efectivo.
 * Si la preferencia está ON pero el OS ya no concede background, reconciliar OFF.
 * Visibility OFF no fuerza bgVisible=false.
 */
export function shouldReconcileBgPreferenceOff(input: {
  bgVisiblePreference: boolean;
  backgroundGranted: boolean;
}): boolean {
  return input.bgVisiblePreference === true && input.backgroundGranted === false;
}
