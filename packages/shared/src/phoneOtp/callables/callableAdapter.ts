import { PHONE_OTP_CALLABLE_NAMES, type PhoneOtpCallableName } from './names';
import { normalizePhoneOtpCallableError } from './errors';
import {
  parseCancelPhoneVerificationResponse,
  parseCheckPhoneVerificationResponse,
  parseGetPhoneVerificationStateResponse,
  parseStartPhoneVerificationResponse,
  serializeCancelPhoneVerificationRequest,
  serializeCheckPhoneVerificationRequest,
  serializeStartPhoneVerificationRequest,
} from './parse';
import type { PhoneOtpClient } from './port';
import type {
  CancelPhoneVerificationRequest,
  CheckPhoneVerificationRequest,
  StartPhoneVerificationRequest,
} from './wireTypes';

export type PhoneOtpCallableInvoker = (
  name: PhoneOtpCallableName,
  data: Record<string, unknown>,
) => Promise<unknown>;

export function createPhoneOtpCallableClient(input: {
  invoke: PhoneOtpCallableInvoker;
}): PhoneOtpClient {
  const invoke = input.invoke;

  async function callParsed<T>(
    name: PhoneOtpCallableName,
    data: Record<string, unknown>,
    parse: (value: unknown) => T,
  ): Promise<T> {
    try {
      const result = await invoke(name, data);
      return parse(result);
    } catch (err) {
      throw normalizePhoneOtpCallableError(err);
    }
  }

  return {
    startPhoneVerification(request: StartPhoneVerificationRequest) {
      return callParsed(
        PHONE_OTP_CALLABLE_NAMES.startPhoneVerification,
        serializeStartPhoneVerificationRequest(request),
        parseStartPhoneVerificationResponse,
      );
    },
    checkPhoneVerification(request: CheckPhoneVerificationRequest) {
      return callParsed(
        PHONE_OTP_CALLABLE_NAMES.checkPhoneVerification,
        serializeCheckPhoneVerificationRequest(request),
        parseCheckPhoneVerificationResponse,
      );
    },
    getPhoneVerificationState() {
      return callParsed(
        PHONE_OTP_CALLABLE_NAMES.getPhoneVerificationState,
        {},
        parseGetPhoneVerificationStateResponse,
      );
    },
    cancelPhoneVerification(request: CancelPhoneVerificationRequest) {
      return callParsed(
        PHONE_OTP_CALLABLE_NAMES.cancelPhoneVerification,
        serializeCancelPhoneVerificationRequest(request),
        parseCancelPhoneVerificationResponse,
      );
    },
  };
}
