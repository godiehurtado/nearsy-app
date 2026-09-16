/**
 * Authoritative active-profile mode switch via setActiveProfileMode callable.
 * Non-optimistic: callers apply mode/visibility only after a valid response.
 */

import type { TFunction } from 'i18next';

import type { ProfileMode } from '../profile/profileModeFields';
import {
  buildSetActiveProfileModeRequest,
  normalizeVisibilityCallableError,
  type SetActiveProfileModeResponse,
  type VisibilityDiscoveryClient,
  type VisibilityDiscoveryClientError,
} from './callables';
import {
  clearActiveProfileModeConfirmation,
  recordActiveProfileModeConfirmation,
} from './activeProfileModeReconciliation';

export type SetActiveProfileModeOutcome =
  | { ok: true; response: SetActiveProfileModeResponse }
  | { ok: false; error: VisibilityDiscoveryClientError };

export type ActiveProfileModeErrorPresentation = {
  title: string;
  userMessage: string;
  retryable: boolean;
};

export async function setActiveProfileModeFlow(
  client: VisibilityDiscoveryClient,
  mode: ProfileMode,
  uid: string,
): Promise<SetActiveProfileModeOutcome> {
  try {
    const response = await client.setActiveProfileMode(
      buildSetActiveProfileModeRequest(mode),
    );
    recordActiveProfileModeConfirmation({
      uid,
      mode: response.mode,
      visibility: response.visibility,
    });
    return { ok: true, response };
  } catch (err) {
    return {
      ok: false,
      error: normalizeVisibilityCallableError(err),
    };
  }
}

/**
 * BUG-PROFILE-02: after a successful Professional face save, re-run the
 * canonical setActiveProfileMode path so Discovery projection can restore.
 * Personal saves and incomplete faces must skip.
 */
export function shouldResyncProfessionalDiscoveryProjection(input: {
  activeMode: ProfileMode | null;
  professionalFaceComplete: boolean;
}): boolean {
  return (
    input.activeMode === 'professional' && input.professionalFaceComplete === true
  );
}

export type ProfessionalDiscoveryResyncResult =
  | { kind: 'skipped' }
  | { kind: 'synced'; response: SetActiveProfileModeResponse }
  | { kind: 'failed'; error: VisibilityDiscoveryClientError };

/**
 * At most one intended callable when gated. Call only after Firestore save OK.
 */
export async function resyncProfessionalDiscoveryProjectionAfterSave(input: {
  activeMode: ProfileMode | null;
  professionalFaceComplete: boolean;
  uid: string;
  client: VisibilityDiscoveryClient;
}): Promise<ProfessionalDiscoveryResyncResult> {
  if (
    !shouldResyncProfessionalDiscoveryProjection({
      activeMode: input.activeMode,
      professionalFaceComplete: input.professionalFaceComplete,
    })
  ) {
    return { kind: 'skipped' };
  }
  const outcome = await setActiveProfileModeFlow(
    input.client,
    'professional',
    input.uid,
  );
  if (outcome.ok === false) {
    return { kind: 'failed', error: outcome.error };
  }
  return { kind: 'synced', response: outcome.response };
}

export { clearActiveProfileModeConfirmation };

export function presentActiveProfileModeError(
  t: TFunction,
  err: VisibilityDiscoveryClientError,
): ActiveProfileModeErrorPresentation {
  if (
    err.code === 'unavailable' ||
    err.retryable
  ) {
    return {
      title: t('activeProfileMode.errors.title'),
      userMessage: t('activeProfileMode.errors.networkUnavailable'),
      retryable: true,
    };
  }
  return {
    title: t('activeProfileMode.errors.title'),
    userMessage: t('activeProfileMode.errors.generic'),
    retryable: err.retryable,
  };
}

export function applyActiveProfileModeResponseToUserDoc<
  T extends Record<string, unknown>,
>(doc: T, response: SetActiveProfileModeResponse): T {
  return {
    ...doc,
    mode: response.mode,
    // GLOBAL visibility intent from Unit 4A — independent of face completeness.
    visibility: response.visibility,
  };
}

export type ActiveProfileModeSwitchSession = {
  /** Blocks concurrent requests from the same control surface. */
  readonly isBusy: () => boolean;
  /**
   * Switch to target mode. Keeps prior mode until callable confirms.
   * Returns `blocked` when a request is already in flight.
   */
  switchMode: (
    targetMode: ProfileMode,
    options: {
      client: VisibilityDiscoveryClient;
      confirmedMode: ProfileMode;
      uid: string;
    },
  ) => Promise<
    | { kind: 'blocked' }
    | { kind: 'noop' }
    | { kind: 'superseded' }
    | SetActiveProfileModeOutcome
  >;
};

/** Serializable in-flight guard for mode toggles (no optimistic UI). */
export function createActiveProfileModeSwitchSession(): ActiveProfileModeSwitchSession {
  let busy = false;
  let generation = 0;

  return {
    isBusy: () => busy,
    async switchMode(targetMode, { client, confirmedMode, uid }) {
      if (busy) return { kind: 'blocked' };
      if (targetMode === confirmedMode) return { kind: 'noop' };

      busy = true;
      const requestGeneration = ++generation;
      try {
        const outcome = await setActiveProfileModeFlow(client, targetMode, uid);
        if (requestGeneration !== generation) {
          return { kind: 'superseded' };
        }
        return outcome;
      } finally {
        if (requestGeneration === generation) {
          busy = false;
        }
      }
    },
  };
}
