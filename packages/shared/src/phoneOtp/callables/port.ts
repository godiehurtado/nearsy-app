import type {
  CancelPhoneVerificationRequest,
  CancelPhoneVerificationResponse,
  CheckPhoneVerificationRequest,
  CheckPhoneVerificationResponse,
  GetPhoneVerificationStateResponse,
  StartPhoneVerificationRequest,
  StartPhoneVerificationResponse,
} from './wireTypes';

export type PhoneOtpClient = {
  startPhoneVerification(
    request: StartPhoneVerificationRequest,
  ): Promise<StartPhoneVerificationResponse>;
  checkPhoneVerification(
    request: CheckPhoneVerificationRequest,
  ): Promise<CheckPhoneVerificationResponse>;
  getPhoneVerificationState(): Promise<GetPhoneVerificationStateResponse>;
  cancelPhoneVerification(
    request: CancelPhoneVerificationRequest,
  ): Promise<CancelPhoneVerificationResponse>;
};
