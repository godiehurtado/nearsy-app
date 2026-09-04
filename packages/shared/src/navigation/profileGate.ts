/**
 * Shared profile gate resolution for AppNavigator.
 * Fail-closed: read errors never map to "complete" or "missing".
 * Incomplete profiles use onboarding resolver (DOB → OTP → CRJ).
 */

import { resolveOnboardingRoute } from '../phoneOtp/onboardingResolver.ts';

export type ProfileGatePhase =
  | 'loading'
  | 'profile_missing_or_incomplete'
  | 'profile_complete'
  | 'profile_read_error';

export type ProfileReadErrorReason = 'permission_denied' | 'transient';

export type ProfileGateStatus =
  | { phase: 'loading' }
  | { phase: 'profile_missing_or_incomplete'; data: unknown }
  | { phase: 'profile_complete'; data: unknown }
  | { phase: 'profile_read_error'; reason: ProfileReadErrorReason };

/** Keep aligned with utils/profileDocumentComplete.ts (profileSetupCompleted === true). */
function isProfileDocumentComplete(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as Record<string, unknown>).profileSetupCompleted === true;
}

export function statusFromProfileDocument(data: unknown): Exclude<
  ProfileGatePhase,
  'loading' | 'profile_read_error'
> {
  return isProfileDocumentComplete(data)
    ? 'profile_complete'
    : 'profile_missing_or_incomplete';
}

export function classifyProfileReadError(err: unknown): ProfileReadErrorReason {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') {
      const normalized = code.trim().toLowerCase();
      if (
        normalized === 'permission-denied' ||
        normalized === 'firestore/permission-denied'
      ) {
        return 'permission_denied';
      }
    }
  }
  return 'transient';
}

export type ProfileGateListen = (
  uid: string,
  onData: (data: unknown) => void,
  onErr: (err: unknown) => void,
) => () => void;

export type ProfileGateGet = (uid: string) => Promise<unknown>;

/**
 * Manages a single profile listener + get fallback.
 * `start` / `retry` replace any prior subscription (no duplicate listeners).
 * `stop` increments generation so in-flight callbacks are ignored.
 */
export function createProfileGateController(deps: {
  listen: ProfileGateListen;
  get: ProfileGateGet;
}) {
  let unsubscribe: (() => void) | null = null;
  let generation = 0;

  function clearSubscription() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function stop() {
    generation += 1;
    clearSubscription();
  }

  function start(
    uid: string,
    onStatus: (status: ProfileGateStatus) => void,
  ): void {
    stop();
    const gen = generation;
    onStatus({ phase: 'loading' });

    unsubscribe = deps.listen(
      uid,
      (data) => {
        if (gen !== generation) return;
        const phase = statusFromProfileDocument(data);
        onStatus(
          phase === 'profile_complete'
            ? { phase, data }
            : { phase, data },
        );
      },
      (listenErr) => {
        void (async () => {
          if (gen !== generation) return;
          try {
            const data = await deps.get(uid);
            if (gen !== generation) return;
            const phase = statusFromProfileDocument(data);
            onStatus(
              phase === 'profile_complete'
                ? { phase, data }
                : { phase, data },
            );
          } catch (getErr) {
            if (gen !== generation) return;
            const reason = classifyProfileReadError(getErr ?? listenErr);
            onStatus({ phase: 'profile_read_error', reason });
          }
        })();
      },
    );
  }

  function retry(
    uid: string,
    onStatus: (status: ProfileGateStatus) => void,
  ): void {
    start(uid, onStatus);
  }

  return { start, stop, retry };
}

/** Destinations the authenticated shell may show (shared by all auth providers). */
export type AuthenticatedProfileFlow =
  | { kind: 'loading' }
  | { kind: 'PhoneVerification' }
  | { kind: 'ProfileCompletion' }
  | { kind: 'MainTabs' }
  | { kind: 'profile_read_error'; reason: ProfileReadErrorReason };

/** i18n keys rendered by the profile-gate error UI (EN/ES via onboarding resources). */
export const PROFILE_GATE_I18N_KEYS = {
  errorTitle: 'onboarding.profileGate.errorTitle',
  errorMessage: 'onboarding.profileGate.errorMessage',
  permissionDeniedMessage: 'onboarding.profileGate.permissionDeniedMessage',
  retry: 'onboarding.profileGate.retry',
} as const;

export function resolveAuthenticatedProfileFlow(
  status: ProfileGateStatus,
): AuthenticatedProfileFlow {
  switch (status.phase) {
    case 'loading':
      return { kind: 'loading' };
    case 'profile_complete':
      return { kind: 'MainTabs' };
    case 'profile_read_error':
      return { kind: 'profile_read_error', reason: status.reason };
    case 'profile_missing_or_incomplete': {
      const route = resolveOnboardingRoute(status.data);
      switch (route.kind) {
        case 'complete':
          return { kind: 'MainTabs' };
        case 'needsPhoneVerification':
          return { kind: 'PhoneVerification' };
        case 'needsDateOfBirth':
        case 'needsProfileCompletion':
          // Full DOB / CRJ parity is J04 — reuse existing ProfileCompletion shell.
          return { kind: 'ProfileCompletion' };
        default:
          return { kind: 'ProfileCompletion' };
      }
    }
  }
}

/**
 * Full-screen loader must not trap guests: profile gate only applies when
 * authenticated. Without this, `profileFlow.kind === 'loading'` with `!uid`
 * blocks Welcome / Login / Register indefinitely.
 */
export function isAuthenticatedProfileLoading(
  uid: string | null | undefined,
  profileFlowKind: AuthenticatedProfileFlow['kind'],
): boolean {
  return Boolean(uid) && profileFlowKind === 'loading';
}

/**
 * Session wrapper used by AppNavigator.
 * start/retry/stop semantics are identical for Google, password, and LinkedIn.
 */
export function createAuthenticatedProfileGate(deps: {
  listen: ProfileGateListen;
  get: ProfileGateGet;
}) {
  const gate = createProfileGateController(deps);

  function start(
    uid: string,
    onFlow: (flow: AuthenticatedProfileFlow) => void,
  ): void {
    gate.start(uid, (status) => {
      onFlow(resolveAuthenticatedProfileFlow(status));
    });
  }

  function retry(
    uid: string,
    onFlow: (flow: AuthenticatedProfileFlow) => void,
  ): void {
    gate.retry(uid, (status) => {
      onFlow(resolveAuthenticatedProfileFlow(status));
    });
  }

  function stop(): void {
    gate.stop();
  }

  return { start, retry, stop };
}
