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
};

export type VisibilityPresentation = {
  /** null → neutral hydration (spinner/loading), not Inactive. */
  visualActive: boolean | null;
  allowToggle: boolean;
  /** Runtime/BG may start only when validated effective is true. */
  canStartRuntime: boolean;
};

/**
 * Persisted true + validating → visual Active (no runtime).
 * Persisted false → Inactive immediately.
 * Unknown profile → neutral (null), never invent false.
 * Once validatedEffective is true, allowToggle stays true unless operationBusy
 * (defensive against stale validationPending from profile snapshot churn).
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

  if (!persistedOn) {
    return {
      visualActive: false,
      allowToggle: !busy && !input.validationPending,
      canStartRuntime: false,
    };
  }

  // Validated ON wins over stale pending flags (snapshot churn / concurrent journey).
  if (input.validatedEffective === true) {
    return {
      visualActive: true,
      allowToggle: !busy,
      canStartRuntime: true,
    };
  }

  // Persisted Active, not yet concluded
  if (input.validationPending || input.validatedEffective === null) {
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
