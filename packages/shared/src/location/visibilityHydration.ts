/**
 * Home Visibility hydration — eliminate Inactive→Active flicker.
 * Provisional Active during permission validation does NOT authorize runtime.
 */

/**
 * After CRJ activateVisibility (or toggle restore), the first Firestore snapshot
 * may still be a cached `visibility:false`. Home must not leave
 * `permissionsValid===false` sticky when Visibility later becomes true — that
 * incorrectly renders Inactive while runtime/gates already treat Visibility ON.
 */
export function shouldResetPermissionValidationOnVisibilityChange(
  previousVisibility: boolean | undefined,
  nextVisibility: boolean | undefined,
): boolean {
  return nextVisibility === true && previousVisibility !== true;
}

export type VisibilityHydrationPhase =
  | 'unknown'
  | 'validating'
  | 'active'
  | 'inactive';

export type VisibilityHydrationInput = {
  /** Profile document loaded? */
  profileLoaded: boolean;
  /** Persisted users.visibility (undefined = field missing / unknown). */
  persistedVisibility: boolean | undefined;
  /** True while OS permission / recovery check is in flight. */
  permissionValidationPending: boolean;
  /** Result of permission validation (undefined while pending). */
  permissionsValid?: boolean;
};

export type VisibilityHydrationResult = {
  phase: VisibilityHydrationPhase;
  /** Visual Active (may be provisional). */
  displayActive: boolean;
  /** May start FGS / publish. */
  runtimeEligible: boolean;
  /** Should call deactivateVisibility after failed validation. */
  shouldDeactivate: boolean;
  /** Disable contradictory toggles while validating. */
  toggleDisabled: boolean;
};

export function evaluateVisibilityHydration(
  input: VisibilityHydrationInput,
): VisibilityHydrationResult {
  if (!input.profileLoaded || input.persistedVisibility === undefined) {
    return {
      phase: 'unknown',
      displayActive: false,
      runtimeEligible: false,
      shouldDeactivate: false,
      toggleDisabled: true,
    };
  }

  if (input.persistedVisibility === false) {
    return {
      phase: 'inactive',
      displayActive: false,
      runtimeEligible: false,
      shouldDeactivate: false,
      toggleDisabled: false,
    };
  }

  // persisted true
  if (input.permissionValidationPending || input.permissionsValid === undefined) {
    return {
      phase: 'validating',
      displayActive: true, // provisional Active
      runtimeEligible: false,
      shouldDeactivate: false,
      toggleDisabled: true,
    };
  }

  if (input.permissionsValid) {
    return {
      phase: 'active',
      displayActive: true,
      runtimeEligible: true,
      shouldDeactivate: false,
      toggleDisabled: false,
    };
  }

  return {
    phase: 'inactive',
    displayActive: false,
    runtimeEligible: false,
    shouldDeactivate: true,
    toggleDisabled: false,
  };
}
