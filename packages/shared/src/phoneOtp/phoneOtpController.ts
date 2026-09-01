/**
 * Pure Phone OTP controller — no React, no persistence.
 */

import type { PhoneOtpClient } from './callables/port';
import {
  isPhoneOtpClientError,
  type PhoneOtpClientError,
} from './callables/errors';
import type {
  GetPhoneVerificationStateResponse,
  PhoneVerificationUiState,
  StartPhoneVerificationResponse,
} from './callables/wireTypes';
import { isValidOtpCode } from './callables/parse';

export type PhoneOtpPhase =
  | 'bootstrapping'
  | 'capture'
  | 'confirm'
  | 'sending'
  | 'pending'
  | 'checking'
  | 'verified'
  | 'expired'
  | 'locked'
  | 'cancelled'
  | 'failed'
  | 'feature_disabled'
  | 'auth_failure'
  | 'app_check_failure';

export type PhoneOtpViewState = {
  phase: PhoneOtpPhase;
  challengeId: string | null;
  maskedPhone: string | null;
  expiresAt: string | null;
  resendAvailableAt: string | null;
  attemptsRemaining: number | null;
  sendsRemaining30m: number | null;
  sendsRemaining24h: number | null;
  phoneE164InMemory: string | null;
  code: string;
  lastError: PhoneOtpClientError | null;
  operationInFlight: boolean;
  bootstrapComplete: boolean;
};

export type PhoneOtpControllerDeps = {
  client: PhoneOtpClient;
  nowMs?: () => number;
  locale?: 'en' | 'es';
  logoutCancelTimeoutMs?: number;
};

function initialViewState(): PhoneOtpViewState {
  return {
    phase: 'bootstrapping',
    challengeId: null,
    maskedPhone: null,
    expiresAt: null,
    resendAvailableAt: null,
    attemptsRemaining: null,
    sendsRemaining30m: null,
    sendsRemaining24h: null,
    phoneE164InMemory: null,
    code: '',
    lastError: null,
    operationInFlight: false,
    bootstrapComplete: false,
  };
}

function phaseFromUiState(uiState: PhoneVerificationUiState): PhoneOtpPhase {
  switch (uiState) {
    case 'none':
      return 'capture';
    case 'pending':
      return 'pending';
    case 'sending':
      return 'sending';
    case 'checking':
      return 'checking';
    case 'verified':
      return 'verified';
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    case 'locked':
      return 'locked';
    case 'failed':
      return 'failed';
    default:
      return 'capture';
  }
}

function mapClientError(err: unknown): PhoneOtpClientError {
  if (isPhoneOtpClientError(err)) return err;
  return {
    kind: 'PhoneOtpClientError',
    name: 'PhoneOtpClientError',
    message: 'Phone verification failed.',
    code: 'unknown',
    reason: 'generic',
    retryable: true,
    messageKey: 'phoneOtp.errors.generic',
  } as PhoneOtpClientError;
}

function applyServerState(
  state: PhoneOtpViewState,
  server: GetPhoneVerificationStateResponse,
): PhoneOtpViewState {
  const next: PhoneOtpViewState = {
    ...state,
    challengeId: server.challengeId,
    maskedPhone: server.phoneMasked,
    expiresAt: server.expiresAt,
    resendAvailableAt: server.resendAvailableAt,
    attemptsRemaining: server.attemptsRemaining,
    sendsRemaining30m: server.sendsRemaining30m,
    sendsRemaining24h: server.sendsRemaining24h,
    bootstrapComplete: true,
    operationInFlight: false,
  };

  if (server.phoneVerified || server.uiState === 'verified') {
    return { ...next, phase: 'verified', lastError: null };
  }

  const phase = phaseFromUiState(server.uiState);
  return {
    ...next,
    phase,
    lastError: phase === 'feature_disabled' ? state.lastError : null,
  };
}

function applyStartResponse(
  state: PhoneOtpViewState,
  start: StartPhoneVerificationResponse,
  phoneE164: string,
): PhoneOtpViewState {
  return {
    ...state,
    phase: 'pending',
    challengeId: start.challengeId,
    maskedPhone: start.maskedPhone,
    expiresAt: start.expiresAt,
    resendAvailableAt: start.resendAvailableAt,
    sendsRemaining30m: start.sendsRemaining30m,
    sendsRemaining24h: start.sendsRemaining24h,
    phoneE164InMemory: phoneE164,
    code: '',
    lastError: null,
    operationInFlight: false,
    bootstrapComplete: true,
  };
}

export function createPhoneOtpController(deps: PhoneOtpControllerDeps) {
  let state = initialViewState();
  let disposed = false;
  const nowMs = deps.nowMs ?? (() => Date.now());
  const logoutCancelTimeoutMs = deps.logoutCancelTimeoutMs ?? 5_000;

  const getState = () => state;

  const setState = (next: PhoneOtpViewState) => {
    if (disposed) return state;
    state = next;
    return state;
  };

  async function bootstrap(): Promise<PhoneOtpViewState> {
    if (state.operationInFlight) return state;
    setState({ ...state, phase: 'bootstrapping', operationInFlight: true, lastError: null });
    try {
      const server = await deps.client.getPhoneVerificationState();
      return setState(applyServerState(state, server));
    } catch (err) {
      const mapped = mapClientError(err);
      const phase =
        mapped.reason === 'app_check_failed'
          ? 'app_check_failure'
          : mapped.reason === 'auth_required'
            ? 'auth_failure'
            : 'failed';
      return setState({
        ...state,
        phase,
        lastError: mapped,
        operationInFlight: false,
        bootstrapComplete: true,
      });
    }
  }

  async function refreshFromServer(): Promise<PhoneOtpViewState> {
    if (state.operationInFlight) return state;
    setState({ ...state, operationInFlight: true, lastError: null });
    try {
      const server = await deps.client.getPhoneVerificationState();
      return setState(applyServerState(state, server));
    } catch (err) {
      const mapped = mapClientError(err);
      return setState({
        ...state,
        lastError: mapped,
        operationInFlight: false,
      });
    }
  }

  function setPhoneE164(phoneE164: string): PhoneOtpViewState {
    return setState({
      ...state,
      phoneE164InMemory: phoneE164,
      phase: 'confirm',
      lastError: null,
    });
  }

  function setCode(code: string): PhoneOtpViewState {
    const digits = code.replace(/\D/g, '').slice(0, 6);
    return setState({ ...state, code: digits, lastError: null });
  }

  function beginCapture(): PhoneOtpViewState {
    return setState({
      ...state,
      phase: 'capture',
      code: '',
      lastError: null,
    });
  }

  function canResend(): boolean {
    if (!state.resendAvailableAt) return false;
    return Date.parse(state.resendAvailableAt) <= nowMs();
  }

  function resendSecondsRemaining(): number {
    if (!state.resendAvailableAt) return 0;
    const delta = Date.parse(state.resendAvailableAt) - nowMs();
    return delta > 0 ? Math.ceil(delta / 1000) : 0;
  }

  async function startVerification(phoneE164: string): Promise<PhoneOtpViewState> {
    if (state.operationInFlight) return state;
    setState({
      ...state,
      phase: 'sending',
      operationInFlight: true,
      phoneE164InMemory: phoneE164,
      lastError: null,
    });
    try {
      const start = await deps.client.startPhoneVerification({
        phoneE164,
        locale: deps.locale,
      });
      return setState(applyStartResponse(state, start, phoneE164));
    } catch (err) {
      const mapped = mapClientError(err);
      if (mapped.reason !== 'feature_disabled') {
        try {
          const server = await deps.client.getPhoneVerificationState();
          const recovered = applyServerState(state, server);
          return setState({ ...recovered, lastError: mapped });
        } catch {
          // fall through to terminal phase mapping below
        }
      }
      const phase =
        mapped.reason === 'feature_disabled'
          ? 'feature_disabled'
          : mapped.reason === 'app_check_failed'
            ? 'app_check_failure'
            : mapped.reason === 'auth_required'
              ? 'auth_failure'
              : 'failed';
      return setState({
        ...state,
        phase,
        lastError: mapped,
        operationInFlight: false,
      });
    }
  }

  async function resend(): Promise<PhoneOtpViewState> {
    if (!canResend()) return state;
    if (!state.phoneE164InMemory) {
      return setState({
        ...state,
        phase: 'capture',
        lastError: null,
      });
    }
    return startVerification(state.phoneE164InMemory);
  }

  async function checkCode(): Promise<PhoneOtpViewState> {
    if (state.operationInFlight) return state;
    if (!state.challengeId || !isValidOtpCode(state.code)) {
      return setState({
        ...state,
        lastError: mapClientError({
          code: 'functions/invalid-argument',
          message: 'Verification code must be exactly six digits.',
        }),
      });
    }
    setState({ ...state, phase: 'checking', operationInFlight: true, lastError: null });
    try {
      await deps.client.checkPhoneVerification({
        challengeId: state.challengeId,
        code: state.code,
      });
      const server = await deps.client.getPhoneVerificationState();
      return setState(applyServerState(state, server));
    } catch (err) {
      const mapped = mapClientError(err);
      try {
        const server = await deps.client.getPhoneVerificationState();
        const recovered = applyServerState(state, server);
        return setState({ ...recovered, lastError: mapped });
      } catch {
        const phase =
          mapped.reason === 'feature_disabled'
            ? 'feature_disabled'
            : phaseFromUiState(state.phase as PhoneVerificationUiState) === 'pending'
              ? 'pending'
              : 'failed';
        return setState({
          ...state,
          phase,
          lastError: mapped,
          operationInFlight: false,
        });
      }
    }
  }

  async function changePhone(): Promise<PhoneOtpViewState> {
    const challengeId = state.challengeId;
    if (challengeId) {
      try {
        await deps.client.cancelPhoneVerification({ challengeId });
      } catch {
        // best-effort
      }
    }
    return setState({
      ...initialViewState(),
      phase: 'capture',
      bootstrapComplete: true,
    });
  }

  async function cancelChallenge(): Promise<PhoneOtpViewState> {
    return changePhone();
  }

  async function prepareLogout(): Promise<void> {
    const challengeId = state.challengeId;
    if (!challengeId) return;
    const cancelPromise = deps.client
      .cancelPhoneVerification({ challengeId })
      .catch(() => {
        // Best-effort: absorb late cancel failures after timeout.
      });
    try {
      await Promise.race([
        cancelPromise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, logoutCancelTimeoutMs);
        }),
      ]);
    } catch {
      // logout must not be blocked
    }
  }

  function resetSensitiveSessionState(): PhoneOtpViewState {
    return setState({
      ...initialViewState(),
      phase: 'capture',
      bootstrapComplete: true,
    });
  }

  function dispose(): void {
    disposed = true;
    state = initialViewState();
  }

  function onForeground(): Promise<PhoneOtpViewState> {
    if (!state.bootstrapComplete) return bootstrap();
    return refreshFromServer();
  }

  return {
    getState,
    bootstrap,
    refreshFromServer,
    setPhoneE164,
    setCode,
    beginCapture,
    canResend,
    resendSecondsRemaining,
    startVerification,
    resend,
    checkCode,
    changePhone,
    cancelChallenge,
    prepareLogout,
    resetSensitiveSessionState,
    dispose,
    onForeground,
  };
}

export type PhoneOtpController = ReturnType<typeof createPhoneOtpController>;
