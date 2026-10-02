/**
 * Home Visibility hydration — eliminate Inactive→Active flicker.
 * Provisional Active during permission validation does NOT authorize runtime.
 * CRJ activate-success one-shot may show provisional Active before Firestore true.
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

export type VisibilityPermissionValidationPatch = {
  permissionsValid: boolean | undefined;
  permissionValidationPending: boolean;
};

/**
 * Snapshot-path permission state for Visibility hydration.
 * Apply in the same update as `setProfile` so rising-edge `true` never paints
 * sticky Inactive (`permissionsValid===false`) before an effect runs.
 * Returns null when the snapshot should leave permission state unchanged.
 *
 * While `crjActivationProvisional` is set, cached `visibility:false` must NOT
 * sticky-invalidate — that would block FG validation and flash Inactive.
 */
export function resolvePermissionValidationOnVisibilitySnapshot(input: {
  previousVisibility: boolean | undefined;
  nextVisibility: boolean | undefined;
  crjActivationProvisional?: boolean;
}): VisibilityPermissionValidationPatch | null {
  if (input.nextVisibility === false) {
    if (input.crjActivationProvisional) {
      return null;
    }
    return {
      permissionsValid: false,
      permissionValidationPending: false,
    };
  }
  if (
    shouldResetPermissionValidationOnVisibilityChange(
      input.previousVisibility,
      input.nextVisibility,
    )
  ) {
    return {
      permissionsValid: undefined,
      permissionValidationPending: true,
    };
  }
  return null;
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
  /**
   * One-shot after CRJ activateVisibility success — provisional Active even when
   * the first snapshot is still cached false. Never authorizes runtime.
   */
  crjActivationProvisional?: boolean;
  /**
   * Last server-confirmed Visibility for this uid (see lastConfirmedVisibility).
   * Only fills the gap while the authoritative value is unknown — it never
   * overrides a loaded value and never authorizes runtime.
   */
  lastConfirmedVisibility?: boolean;
  /**
   * Publication session confirmed (activate/publish succeeded) for this uid.
   * false keeps an otherwise Active state provisional with runtime blocked;
   * undefined = caller does not gate on the session.
   */
  runtimeConfirmed?: boolean;
  /** Confirmation publish failed contractually → Inactive (no deactivate). */
  runtimeConfirmationFailed?: boolean;
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

/** Nearby search enable — requires confirmed FG validation, not provisional alone. */
export function isHomeSearchEnabled(input: {
  displayActive: boolean;
  permissionsValid: boolean | undefined;
  /** When provided, search also waits for the session's runtime confirmation. */
  runtimeEligible?: boolean;
}): boolean {
  return (
    input.displayActive &&
    input.permissionsValid === true &&
    input.runtimeEligible !== false
  );
}

const ACTIVE: VisibilityHydrationResult = {
  phase: 'active',
  displayActive: true,
  runtimeEligible: true,
  shouldDeactivate: false,
  toggleDisabled: false,
};

function activeOnceRuntimeConfirmed(
  input: VisibilityHydrationInput,
): VisibilityHydrationResult {
  if (input.runtimeConfirmed !== false) return { ...ACTIVE };
  if (input.runtimeConfirmationFailed) {
    return {
      phase: 'inactive',
      displayActive: false,
      runtimeEligible: false,
      shouldDeactivate: false,
      toggleDisabled: false,
    };
  }
  return {
    phase: 'validating',
    displayActive: true,
    runtimeEligible: false,
    shouldDeactivate: false,
    toggleDisabled: true,
  };
}

/**
 * Persisted Active + validated permissions: the point where Home must confirm
 * the session (activate/publish) before runtime may start.
 */
export function isReadyForRuntimeConfirmation(
  input: VisibilityHydrationInput,
): boolean {
  return (
    input.profileLoaded &&
    input.persistedVisibility === true &&
    input.permissionsValid === true &&
    !input.permissionValidationPending
  );
}

export function evaluateVisibilityHydration(
  input: VisibilityHydrationInput,
): VisibilityHydrationResult {
  // CRJ activate success: Active provisional until permissions conclude or
  // remote Visibility settles — even while cached snapshot is still false.
  if (input.crjActivationProvisional) {
    if (
      input.permissionsValid === false &&
      !input.permissionValidationPending
    ) {
      return {
        phase: 'inactive',
        displayActive: false,
        runtimeEligible: false,
        shouldDeactivate: input.persistedVisibility === true,
        toggleDisabled: false,
      };
    }
    if (
      input.persistedVisibility === true &&
      input.permissionsValid === true &&
      !input.permissionValidationPending
    ) {
      return activeOnceRuntimeConfirmed(input);
    }
    return {
      phase: 'validating',
      displayActive: true,
      runtimeEligible: false,
      shouldDeactivate: false,
      toggleDisabled: true,
    };
  }

  if (!input.profileLoaded || input.persistedVisibility === undefined) {
    if (input.lastConfirmedVisibility === true) {
      return {
        phase: 'validating',
        displayActive: true,
        runtimeEligible: false,
        shouldDeactivate: false,
        toggleDisabled: true,
      };
    }
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
    return activeOnceRuntimeConfirmed(input);
  }

  return {
    phase: 'inactive',
    displayActive: false,
    runtimeEligible: false,
    shouldDeactivate: true,
    toggleDisabled: false,
  };
}
