/**
 * ENH-LOC-01 — explicit location-permission journey state machine (pure).
 * Single owner, single presentation, terminal cleanup. No RN imports.
 */

export type LocationJourneyPhase =
  | 'idle'
  | 'requestingForeground'
  | 'preparing'
  | 'reportingActivationIssue'
  | 'showingBackgroundEducation'
  | 'requestingBackground'
  | 'waitingForSettingsReturn'
  | 'reconciling'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type LocationJourneyOwner = 'crj' | 'bootstrap' | 'home' | 'more';

/** Lower number = higher priority. */
export const LOCATION_JOURNEY_OWNER_PRIORITY: Record<
  LocationJourneyOwner,
  number
> = {
  crj: 1,
  bootstrap: 2,
  home: 3,
  more: 4,
};

export type ActivationJourneyResult =
  | 'success'
  | 'accuracy'
  | 'network_or_backend'
  | 'unavailable'
  | 'permission_denied';

export type BackgroundDecision = 'enable' | 'not_now';

export type JourneyPresentationKind =
  | 'none'
  | 'preparing'
  | 'activationIssue'
  | 'backgroundEducation'
  | 'settingsNeeded';

export type LocationJourneyState = {
  phase: LocationJourneyPhase;
  owner: LocationJourneyOwner | null;
  uidFingerprint: string | null;
  token: string | null;
  foregroundEffective: boolean | null;
  backgroundEffective: boolean | null;
  activationResult: ActivationJourneyResult | null;
  backgroundDecision: BackgroundDecision | null;
  settingsIntentOwner: LocationJourneyOwner | null;
  educationOfferedThisSession: boolean;
  /** Visibility activate/deactivate in flight — only lock source besides hydration. */
  visibilityMutationInFlight: boolean;
  /** First Home hydration validation for persisted Active. */
  initialVisibilityHydrationPending: boolean;
};

export type LocationJourneyEvent =
  | {
      type: 'START';
      owner: LocationJourneyOwner;
      uidFingerprint: string;
      token: string;
    }
  | { type: 'FOREGROUND_RESULT'; granted: boolean }
  | { type: 'ENTER_PREPARING' }
  | { type: 'ACTIVATION_RESULT'; result: ActivationJourneyResult }
  | { type: 'ACTIVATION_ISSUE_ACKNOWLEDGED' }
  | { type: 'ENTER_BACKGROUND_EDUCATION' }
  | { type: 'BACKGROUND_DECISION'; decision: BackgroundDecision }
  | { type: 'ENTER_REQUESTING_BACKGROUND' }
  | {
      type: 'BACKGROUND_RESULT';
      effectiveGranted: boolean;
      needsSettings: boolean;
    }
  | { type: 'ENTER_WAITING_SETTINGS' }
  | { type: 'SETTINGS_RETURN'; backgroundGranted: boolean }
  | { type: 'ENTER_RECONCILING' }
  | { type: 'COMPLETE' }
  | { type: 'CANCEL' }
  | { type: 'FAIL' }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_VISIBILITY_MUTATION'; inFlight: boolean }
  | { type: 'SET_HYDRATION_PENDING'; pending: boolean }
  | { type: 'HYDRATION_DONE' }
  | { type: 'MARK_EDUCATION_OFFERED' };

export function createInitialLocationJourneyState(): LocationJourneyState {
  return {
    phase: 'idle',
    owner: null,
    uidFingerprint: null,
    token: null,
    foregroundEffective: null,
    backgroundEffective: null,
    activationResult: null,
    backgroundDecision: null,
    settingsIntentOwner: null,
    educationOfferedThisSession: false,
    visibilityMutationInFlight: false,
    initialVisibilityHydrationPending: false,
  };
}

export function isTerminalJourneyPhase(phase: LocationJourneyPhase): boolean {
  return (
    phase === 'idle' ||
    phase === 'completed' ||
    phase === 'cancelled' ||
    phase === 'failed'
  );
}

export function canAdvanceNavigation(state: LocationJourneyState): boolean {
  return isTerminalJourneyPhase(state.phase);
}

/**
 * Visibility toggle lock — ONLY mutation in flight or first hydration.
 * Never Always / bgVisible / education / Settings intent.
 */
export function deriveVisibilityToggleDisabled(
  state: Pick<
    LocationJourneyState,
    'visibilityMutationInFlight' | 'initialVisibilityHydrationPending'
  >,
): boolean {
  return (
    state.visibilityMutationInFlight === true ||
    state.initialVisibilityHydrationPending === true
  );
}

export function deriveJourneyPresentation(
  state: LocationJourneyState,
): JourneyPresentationKind {
  switch (state.phase) {
    case 'preparing':
      return 'preparing';
    case 'reportingActivationIssue':
      return 'activationIssue';
    case 'showingBackgroundEducation':
      return 'backgroundEducation';
    case 'waitingForSettingsReturn':
      return 'settingsNeeded';
    default:
      return 'none';
  }
}

/** "Location not enabled" only when FG is not granted or services are off. */
export function shouldUseLocationNotEnabledCopy(input: {
  foregroundGranted: boolean;
  servicesOff: boolean;
}): boolean {
  return input.servicesOff === true || input.foregroundGranted === false;
}

export function mapCrjActivationReasonToResult(
  reason:
    | 'permission-denied'
    | 'unavailable'
    | 'invalid-accuracy'
    | 'callable'
    | 'skipped'
    | null
    | undefined,
): ActivationJourneyResult {
  if (reason === 'invalid-accuracy') return 'accuracy';
  if (reason === 'permission-denied') return 'permission_denied';
  if (reason === 'unavailable') return 'unavailable';
  return 'network_or_backend';
}

function clearJourneyFields(
  state: LocationJourneyState,
  phase: LocationJourneyPhase,
): LocationJourneyState {
  return {
    ...state,
    phase,
    owner: null,
    uidFingerprint: null,
    token: null,
    foregroundEffective: null,
    backgroundEffective: null,
    activationResult: null,
    backgroundDecision: null,
    settingsIntentOwner: null,
    // Keep educationOfferedThisSession across completed journeys in-process.
    visibilityMutationInFlight: false,
    // Hydration is owned by Home; do not clear here on journey end.
  };
}

/**
 * Pure reducer. Stale events (owner/token mismatch) are no-ops.
 */
export function reduceLocationJourney(
  state: LocationJourneyState,
  event: LocationJourneyEvent,
): LocationJourneyState {
  switch (event.type) {
    case 'CLEAR_SESSION':
      return createInitialLocationJourneyState();

    case 'SET_VISIBILITY_MUTATION':
      return {
        ...state,
        visibilityMutationInFlight: event.inFlight,
      };

    case 'SET_HYDRATION_PENDING':
      return {
        ...state,
        initialVisibilityHydrationPending: event.pending,
      };

    case 'HYDRATION_DONE':
      return {
        ...state,
        initialVisibilityHydrationPending: false,
      };

    case 'MARK_EDUCATION_OFFERED':
      return { ...state, educationOfferedThisSession: true };

    case 'START': {
      if (!isTerminalJourneyPhase(state.phase) && state.owner) {
        // Exclusive: reject second owner while active.
        return state;
      }
      return {
        ...createInitialLocationJourneyState(),
        educationOfferedThisSession: state.educationOfferedThisSession,
        initialVisibilityHydrationPending:
          state.initialVisibilityHydrationPending,
        phase: 'requestingForeground',
        owner: event.owner,
        uidFingerprint: event.uidFingerprint,
        token: event.token,
      };
    }

    case 'FOREGROUND_RESULT': {
      if (state.phase !== 'requestingForeground') return state;
      if (!event.granted) {
        return clearJourneyFields(
          {
            ...state,
            foregroundEffective: false,
          },
          'cancelled',
        );
      }
      return {
        ...state,
        foregroundEffective: true,
        phase: 'preparing',
      };
    }

    case 'ENTER_PREPARING': {
      if (
        state.phase !== 'preparing' &&
        state.phase !== 'requestingForeground'
      ) {
        return state;
      }
      return { ...state, phase: 'preparing' };
    }

    case 'ACTIVATION_RESULT': {
      if (state.phase !== 'preparing') return state;
      if (event.result === 'success') {
        return {
          ...state,
          activationResult: 'success',
          phase: 'showingBackgroundEducation',
        };
      }
      return {
        ...state,
        activationResult: event.result,
        phase: 'reportingActivationIssue',
      };
    }

    case 'ACTIVATION_ISSUE_ACKNOWLEDGED': {
      if (state.phase !== 'reportingActivationIssue') return state;
      // FG still granted → continue to BG education.
      if (state.foregroundEffective !== true) {
        return clearJourneyFields(state, 'failed');
      }
      return { ...state, phase: 'showingBackgroundEducation' };
    }

    case 'ENTER_BACKGROUND_EDUCATION': {
      if (
        state.phase !== 'showingBackgroundEducation' &&
        state.phase !== 'preparing'
      ) {
        return state;
      }
      return { ...state, phase: 'showingBackgroundEducation' };
    }

    case 'BACKGROUND_DECISION': {
      if (state.phase !== 'showingBackgroundEducation') return state;
      if (event.decision === 'not_now') {
        return clearJourneyFields(
          {
            ...state,
            backgroundDecision: 'not_now',
            educationOfferedThisSession: true,
            backgroundEffective: state.backgroundEffective,
          },
          'completed',
        );
      }
      return {
        ...state,
        backgroundDecision: 'enable',
        educationOfferedThisSession: true,
        phase: 'requestingBackground',
      };
    }

    case 'ENTER_REQUESTING_BACKGROUND': {
      if (state.phase !== 'requestingBackground') return state;
      return state;
    }

    case 'BACKGROUND_RESULT': {
      if (
        state.phase !== 'requestingBackground' &&
        state.phase !== 'waitingForSettingsReturn' &&
        state.phase !== 'reconciling'
      ) {
        return state;
      }
      if (event.effectiveGranted) {
        return clearJourneyFields(
          {
            ...state,
            backgroundEffective: true,
            settingsIntentOwner: null,
          },
          'completed',
        );
      }
      if (event.needsSettings) {
        return {
          ...state,
          backgroundEffective: false,
          settingsIntentOwner: state.owner,
          phase: 'waitingForSettingsReturn',
        };
      }
      return clearJourneyFields(
        {
          ...state,
          backgroundEffective: false,
          settingsIntentOwner: null,
        },
        'completed',
      );
    }

    case 'ENTER_WAITING_SETTINGS': {
      if (state.phase !== 'waitingForSettingsReturn') return state;
      return state;
    }

    case 'SETTINGS_RETURN': {
      if (state.phase !== 'waitingForSettingsReturn') return state;
      if (event.backgroundGranted) {
        return clearJourneyFields(
          {
            ...state,
            backgroundEffective: true,
            settingsIntentOwner: null,
          },
          'completed',
        );
      }
      return clearJourneyFields(
        {
          ...state,
          backgroundEffective: false,
          settingsIntentOwner: null,
        },
        'completed',
      );
    }

    case 'ENTER_RECONCILING': {
      if (isTerminalJourneyPhase(state.phase)) return state;
      return { ...state, phase: 'reconciling' };
    }

    case 'COMPLETE':
      return clearJourneyFields(state, 'completed');

    case 'CANCEL':
      return clearJourneyFields(state, 'cancelled');

    case 'FAIL':
      return clearJourneyFields(state, 'failed');

    default:
      return state;
  }
}

/**
 * Whether a Settings Open alert may be shown — only while machine is waiting
 * and owner still matches (never after navigation / terminal).
 */
export function canPresentSettingsAlert(
  state: LocationJourneyState,
  expectedOwner: LocationJourneyOwner,
): boolean {
  return (
    state.phase === 'waitingForSettingsReturn' &&
    state.owner === expectedOwner &&
    state.settingsIntentOwner === expectedOwner
  );
}

export function canPresentActivationIssue(
  state: LocationJourneyState,
): boolean {
  return state.phase === 'reportingActivationIssue';
}

export function eventBelongsToOwner(
  state: LocationJourneyState,
  owner: LocationJourneyOwner,
  token?: string | null,
): boolean {
  if (state.owner !== owner) return false;
  if (token && state.token && state.token !== token) return false;
  return true;
}
