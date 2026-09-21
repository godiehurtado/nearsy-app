/**
 * Contractual Android logout sequence (ENH-LOC-01).
 * Injectable deps keep Node unit tests free of RNFirebase / Expo.
 *
 * Order:
 * 1. clear social prefill
 * 2. stop FGS/task (+ clear NEARSY_BG_UID via stop)
 * 3. deactivate Visibility contractually when active
 * 4. signOut
 * Navigation reset remains the caller's responsibility.
 */

export type ContractualLogoutDeps = {
  clearSocialPrefill: () => void;
  stopBackground: () => Promise<void>;
  /** Current Visibility ON/OFF (local cache or fresh read). */
  isVisibilityActive: () => boolean | Promise<boolean>;
  deactivateVisibility: () => Promise<void>;
  signOut: () => Promise<void>;
};

export async function runContractualAndroidLogout(
  deps: ContractualLogoutDeps,
): Promise<void> {
  deps.clearSocialPrefill();
  await deps.stopBackground().catch(() => {});
  const active = await deps.isVisibilityActive();
  if (active) {
    await deps.deactivateVisibility().catch(() => {});
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
