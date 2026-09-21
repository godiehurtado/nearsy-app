/**
 * CRJ Location step (Android) — local sequential decisions only.
 * Not shared with Home/More. No preparation, Visibility, runtime, or Discovery.
 */

export type CrjLocationStepState = {
  /** Owns the in-flight location step (blocks a second press). */
  active: boolean;
  /** True only while a native permission / Settings wait is in flight. */
  buttonLocked: boolean;
  educationVisible: boolean;
  recovery:
    | 'none'
    | 'foreground-denied'
    | 'approximate'
    | 'awaiting-settings';
  /** Preference to persist. null = do not write yet. */
  bgVisible: boolean | null;
  advance: boolean;
  foregroundRequestCount: number;
};

export type CrjLocationStepEvent =
  | { type: 'PRESS' }
  | { type: 'FG_GRANTED' }
  | { type: 'FG_DENIED' }
  | { type: 'FG_APPROXIMATE' }
  | { type: 'FG_ERROR' }
  | { type: 'BG_REQUEST' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'NOT_NOW' }
  | { type: 'BG_GRANTED' }
  | { type: 'BG_DENIED' }
  | { type: 'BG_ERROR' }
  | { type: 'SETTINGS_RETURN_GRANTED' }
  | { type: 'SETTINGS_RETURN_DENIED' }
  | { type: 'ADVANCE_CONSUMED' }
  | { type: 'UNMOUNT' };

export function createInitialCrjLocationStepState(): CrjLocationStepState {
  return {
    active: false,
    buttonLocked: false,
    educationVisible: false,
    recovery: 'none',
    bgVisible: null,
    advance: false,
    foregroundRequestCount: 0,
  };
}

function finishEducation(
  state: CrjLocationStepState,
  bgVisible: boolean,
): CrjLocationStepState {
  return {
    ...state,
    active: false,
    buttonLocked: false,
    educationVisible: false,
    recovery: 'none',
    bgVisible,
    advance: true,
  };
}

/**
 * Pure step reducer. Ignored events return the same state reference
 * so callers can detect a rejected double-press.
 */
export function reduceCrjLocationStep(
  state: CrjLocationStepState,
  event: CrjLocationStepEvent,
): CrjLocationStepState {
  switch (event.type) {
    case 'PRESS':
      if (state.active || state.buttonLocked || state.educationVisible) {
        return state;
      }
      return {
        ...state,
        active: true,
        buttonLocked: true,
        educationVisible: false,
        recovery: 'none',
        bgVisible: null,
        advance: false,
        foregroundRequestCount: state.foregroundRequestCount + 1,
      };
    case 'FG_GRANTED':
      if (!state.active) return state;
      return {
        ...state,
        buttonLocked: false,
        educationVisible: true,
        recovery: 'none',
      };
    case 'FG_APPROXIMATE':
      if (!state.active) return state;
      // Surface Precise CTA; still allow education after caller handles alert.
      return {
        ...state,
        buttonLocked: false,
        educationVisible: true,
        recovery: 'approximate',
      };
    case 'FG_DENIED':
      if (!state.active) return state;
      return {
        ...state,
        active: true,
        buttonLocked: true,
        educationVisible: false,
        recovery: 'foreground-denied',
        advance: true,
      };
    case 'ADVANCE_CONSUMED':
      if (!state.advance) return state;
      return {
        ...state,
        active: false,
        buttonLocked: false,
        advance: false,
        recovery: 'none',
      };
    case 'FG_ERROR':
      if (!state.active || state.educationVisible) return state;
      return {
        ...state,
        active: false,
        buttonLocked: false,
        educationVisible: false,
        recovery: 'none',
        advance: false,
      };
    case 'BG_REQUEST':
      if (!state.educationVisible || state.buttonLocked) return state;
      return { ...state, buttonLocked: true };
    case 'OPEN_SETTINGS':
      // Allowed while education is showing even if BG_REQUEST already locked
      // the primary button (API 30+ Settings CTA after Enable).
      if (!state.educationVisible) return state;
      return {
        ...state,
        buttonLocked: true,
        educationVisible: false,
        recovery: 'awaiting-settings',
      };
    case 'NOT_NOW':
      if (!state.educationVisible || state.buttonLocked) return state;
      return finishEducation(state, false);
    case 'BG_GRANTED':
    case 'SETTINGS_RETURN_GRANTED':
      if (!state.educationVisible && state.recovery !== 'awaiting-settings') {
        return state;
      }
      return finishEducation(state, true);
    case 'BG_DENIED':
    case 'BG_ERROR':
    case 'SETTINGS_RETURN_DENIED':
      if (!state.educationVisible && state.recovery !== 'awaiting-settings') {
        return state;
      }
      return finishEducation(state, false);
    case 'UNMOUNT':
      return {
        ...createInitialCrjLocationStepState(),
        foregroundRequestCount: state.foregroundRequestCount,
      };
    default:
      return state;
  }
}

/** API ≤28: background is effective once foreground is granted. */
export function isBackgroundImplicitWithForeground(apiLevel: number): boolean {
  return Number.isFinite(apiLevel) && apiLevel < 29;
}

/** API 29: system dialog can grant "Allow all the time". */
export function canRequestBackgroundViaDialog(apiLevel: number): boolean {
  return apiLevel === 29;
}

/** API 30+: must open App Settings for "Allow all the time". */
export function requiresBackgroundSettings(apiLevel: number): boolean {
  return Number.isFinite(apiLevel) && apiLevel >= 30;
}
