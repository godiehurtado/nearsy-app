/**
 * ENH-LOC-01 — Home Visibility presentation vs validated runtime eligibility.
 * Visual Active during validation must never imply runtime may start.
 */

export type VisibilityPresentationInput = {
  /** False until first Firestore profile snapshot resolves. */
  profileLoaded: boolean;
  /** Raw persisted visibility from profile (undefined if field absent). */
  persistedVisibility: boolean | undefined;
  /** True while FG/activation validation for this mount/focus is in flight. */
  validationPending: boolean;
  /**
   * null = not concluded yet;
   * true/false = effective after validation (or known without pending work).
   */
  validatedEffective: boolean | null;
  /**
   * Concrete in-flight op (activate/deactivate/prep/education busy).
   * Always/background granted must never set this.
   */
  operationBusy?: boolean;
  /**
   * BUG-VIS-01 — CRJ just activated successfully; keep visual Active while
   * validating even if the first snapshot is still cached visibility=false.
   * Never implies canStartRuntime.
   */
  crjActivationProvisional?: boolean;
};

export type VisibilityPresentation = {
  /** null → neutral hydration (spinner/loading), not Inactive. */
  visualActive: boolean | null;
  allowToggle: boolean;
  /** Runtime/BG may start only when validated effective is true. */
  canStartRuntime: boolean;
};

/** Redacted label for BUG-VIS-01 __DEV__ diagnostics. */
export type BugVis01PresentationLabel =
  | 'active_provisional'
  | 'active_confirmed'
  | 'inactive'
  | 'neutral';

export function labelBugVis01Presentation(input: {
  visualActive: boolean | null;
  canStartRuntime: boolean;
  crjActivationProvisional: boolean;
}): BugVis01PresentationLabel {
  if (input.visualActive === null) return 'neutral';
  if (input.visualActive !== true) return 'inactive';
  if (input.canStartRuntime) return 'active_confirmed';
  if (input.crjActivationProvisional) return 'active_provisional';
  return 'active_provisional';
}

/**
 * BUG-VIS-01 — decide whether Home should re-open hydration validation when a
 * profile snapshot arrives with persisted visibility ON.
 *
 * Entering ON (including false→true after a stale cache snapshot) must invalidate
 * a prior conclusive false so presentation does not paint Inactive. Stable ON
 * after hydration finished must not re-lock on unrelated snapshot churn.
 * Recovery journeys own their own finishValidation path.
 */
export function shouldRearmVisibilityHydration(input: {
  persistedOn: boolean;
  previouslyPersistedOn: boolean;
  hydrationValidationDone: boolean;
  recoveryInFlight: boolean;
}): boolean {
  if (!input.persistedOn) return false;
  if (input.recoveryInFlight) return false;
  if (!input.previouslyPersistedOn) return true;
  return !input.hydrationValidationDone;
}

/**
 * Whether a cached visibility=false snapshot should keep CRJ provisional Active
 * instead of concluding Inactive.
 */
export function shouldKeepCrjProvisionalDespiteCachedOff(input: {
  crjActivationProvisional: boolean;
  validatedEffective: boolean | null;
}): boolean {
  if (!input.crjActivationProvisional) return false;
  // Conclusive FG/validation failure ends provisional.
  if (input.validatedEffective === false) return false;
  return true;
}

/**
 * Persisted true + validating → visual Active (no runtime).
 * Persisted false → Inactive immediately, unless CRJ provisional handoff.
 * Unknown profile → neutral (null), never invent false.
 * Runtime requires persisted true AND validatedEffective true.
 */
export function resolveVisibilityPresentation(
  input: VisibilityPresentationInput,
): VisibilityPresentation {
  const busy = input.operationBusy === true;

  if (!input.profileLoaded) {
    return {
      visualActive: null,
      allowToggle: false,
      canStartRuntime: false,
    };
  }

  const persistedOn = input.persistedVisibility === true;
  const provisional = shouldKeepCrjProvisionalDespiteCachedOff({
    crjActivationProvisional: input.crjActivationProvisional === true,
    validatedEffective: input.validatedEffective,
  });

  if (!persistedOn && !provisional) {
    return {
      visualActive: false,
      allowToggle: !busy && !input.validationPending,
      canStartRuntime: false,
    };
  }

  // Validated ON + persisted ON → runtime eligible.
  if (input.validatedEffective === true && persistedOn) {
    return {
      visualActive: true,
      allowToggle: !busy,
      canStartRuntime: true,
    };
  }

  // Persisted Active (or CRJ provisional) not yet concluded — or validated
  // before remote true arrives: visual Active, never runtime.
  if (
    input.validationPending ||
    input.validatedEffective === null ||
    (provisional && !persistedOn)
  ) {
    return {
      visualActive: true,
      allowToggle: false,
      canStartRuntime: false,
    };
  }

  return {
    visualActive: false,
    allowToggle: !busy,
    canStartRuntime: false,
  };
}
