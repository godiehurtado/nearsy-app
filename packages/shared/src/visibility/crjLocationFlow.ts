/**
 * CRJ Location step — local sequential decisions only.
 * Not the Home/More permission journey. No Settings, no Visibility activate.
 */

export type CrjLocationStepState = {
  /** Owns the in-flight location step (blocks a second press). */
  active: boolean;
  /** True only while a native permission request is in flight. */
  buttonLocked: boolean;
  educationVisible: boolean;
  recovery: 'none' | 'foreground-denied';
  /** Preference to persist. null = do not write. */
  bgVisible: boolean | null;
  advance: boolean;
  foregroundRequestCount: number;
};

export type CrjLocationStepEvent =
  | { type: 'PRESS' }
  | { type: 'FG_GRANTED' }
  | { type: 'FG_DENIED' }
  | { type: 'FG_ERROR' }
  | { type: 'BG_REQUEST' }
  | { type: 'NOT_NOW' }
  | { type: 'BG_GRANTED' }
  | { type: 'BG_DENIED' }
  | { type: 'BG_ERROR' }
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
    case 'NOT_NOW':
      if (!state.educationVisible || state.buttonLocked) return state;
      return finishEducation(state, false);
    case 'BG_GRANTED':
      if (!state.educationVisible) return state;
      return finishEducation(state, true);
    case 'BG_DENIED':
    case 'BG_ERROR':
      if (!state.educationVisible) return state;
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
