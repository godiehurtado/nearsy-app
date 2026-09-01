import { PHONE_OTP_CALLABLE_NAMES } from './names';
import { createPhoneOtpCallableClient } from './callableAdapter';
import type { PhoneOtpClient } from './port';
import type {
  GetPhoneVerificationStateResponse,
  StartPhoneVerificationResponse,
} from './wireTypes';

export type FakePhoneOtpClientState = {
  phoneVerified: boolean;
  challengeId: string | null;
  uiState: GetPhoneVerificationStateResponse['uiState'];
  maskedPhone: string | null;
  expiresAt: string | null;
  resendAvailableAt: string | null;
  attemptsRemaining: number | null;
  featureDisabled: boolean;
  startCalls: number;
  checkCalls: number;
  cancelCalls: number;
  getStateCalls: number;
  startError?: { code: string; message: string } | null;
  checkError?: { code: string; message: string } | null;
  getStateError?: { code: string; message: string } | null;
  cancelFails?: boolean;
  cancelDelayedRejectMs?: number | null;
};

export function createFakePhoneOtpClient(
  initial?: Partial<FakePhoneOtpClientState>,
): PhoneOtpClient & { state: FakePhoneOtpClientState } {
  const state: FakePhoneOtpClientState = {
    phoneVerified: false,
    challengeId: null,
    uiState: 'none',
    maskedPhone: null,
    expiresAt: null,
    resendAvailableAt: null,
    attemptsRemaining: null,
    featureDisabled: false,
    startCalls: 0,
    checkCalls: 0,
    cancelCalls: 0,
    getStateCalls: 0,
    startError: null,
    checkError: null,
    getStateError: null,
    cancelFails: false,
    cancelDelayedRejectMs: null,
    ...initial,
  };

  const client = createPhoneOtpCallableClient({
    invoke: async (name, data) => {
      if (name === PHONE_OTP_CALLABLE_NAMES.getPhoneVerificationState) {
        state.getStateCalls += 1;
        if (state.getStateError) {
          throw state.getStateError;
        }
        return {
          uiState: state.uiState,
          phoneVerified: state.phoneVerified,
          phoneMasked: state.maskedPhone,
          challengeId: state.challengeId,
          expiresAt: state.expiresAt,
          resendAvailableAt: state.resendAvailableAt,
          attemptCount:
            state.attemptsRemaining === null
              ? null
              : 5 - state.attemptsRemaining,
          attemptsRemaining: state.attemptsRemaining,
          sendsRemaining30m: 3,
          sendsRemaining24h: 10,
        };
      }

      if (name === PHONE_OTP_CALLABLE_NAMES.startPhoneVerification) {
        state.startCalls += 1;
        if (state.startError) {
          throw state.startError;
        }
        if (state.featureDisabled) {
          throw {
            code: 'functions/failed-precondition',
            message: 'Phone verification is temporarily unavailable.',
          };
        }
        const phoneE164 = String((data as { phoneE164?: string }).phoneE164 ?? '');
        const now = Date.now();
        state.challengeId = 'ch_fake_123';
        state.uiState = 'pending';
        state.maskedPhone = phoneE164.replace(/\d(?=\d{2})/g, '•');
        state.expiresAt = new Date(now + 5 * 60_000).toISOString();
        state.resendAvailableAt = new Date(now + 60_000).toISOString();
        state.attemptsRemaining = 5;
        const out: StartPhoneVerificationResponse = {
          challengeId: state.challengeId,
          maskedPhone: state.maskedPhone,
          expiresAt: state.expiresAt,
          resendAvailableAt: state.resendAvailableAt,
          sendsRemaining30m: 3,
          sendsRemaining24h: 10,
          smsSent: false,
        };
        return out;
      }

      if (name === PHONE_OTP_CALLABLE_NAMES.checkPhoneVerification) {
        state.checkCalls += 1;
        if (state.checkError) {
          throw state.checkError;
        }
        if (state.featureDisabled) {
          throw {
            code: 'functions/failed-precondition',
            message: 'Phone verification is temporarily unavailable.',
          };
        }
        const code = String((data as { code?: string }).code ?? '');
        if (code !== '123456') {
          state.attemptsRemaining = Math.max(0, (state.attemptsRemaining ?? 5) - 1);
          throw {
            code: 'functions/failed-precondition',
            message: 'Verification code is incorrect.',
          };
        }
        state.phoneVerified = true;
        state.uiState = 'verified';
        return {
          phoneVerified: true,
          phoneMasked: state.maskedPhone ?? '••••••',
          replacedPrevious: false,
        };
      }

      if (name === PHONE_OTP_CALLABLE_NAMES.cancelPhoneVerification) {
        state.cancelCalls += 1;
        if (state.cancelDelayedRejectMs != null) {
          await new Promise((resolve) => {
            setTimeout(resolve, state.cancelDelayedRejectMs as number);
          });
          throw {
            code: 'functions/unavailable',
            message: 'Unable to complete phone verification right now.',
          };
        }
        if (state.cancelFails) {
          throw {
            code: 'functions/unavailable',
            message: 'Unable to complete phone verification right now.',
          };
        }
        state.challengeId = null;
        state.uiState = 'cancelled';
        state.attemptsRemaining = null;
        return {
          cancelled: true,
          challengeId: String((data as { challengeId?: string }).challengeId ?? ''),
        };
      }

      throw new Error(`Unexpected fake callable: ${name}`);
    },
  });

  return Object.assign(client, { state });
}
