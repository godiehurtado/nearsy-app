export const PHONE_OTP_CALLABLE_NAMES = {
  startPhoneVerification: 'startPhoneVerification',
  checkPhoneVerification: 'checkPhoneVerification',
  getPhoneVerificationState: 'getPhoneVerificationState',
  cancelPhoneVerification: 'cancelPhoneVerification',
} as const;

export type PhoneOtpCallableName =
  (typeof PHONE_OTP_CALLABLE_NAMES)[keyof typeof PHONE_OTP_CALLABLE_NAMES];
