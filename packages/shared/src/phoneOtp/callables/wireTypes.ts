/**
 * Phone OTP callable wire types — mirror backend domain @ e201708.
 * Client-safe surface only (no Twilio SIDs, hashes, or internal fields).
 */

export const OTP_CODE_LENGTH = 6;

export type PhoneOtpLocale = 'en' | 'es';

export type PhoneVerificationUiState =
  | 'none'
  | 'pending'
  | 'sending'
  | 'checking'
  | 'expired'
  | 'cancelled'
  | 'locked'
  | 'failed'
  | 'verified';

export type StartPhoneVerificationRequest = {
  phoneE164: string;
  locale?: PhoneOtpLocale;
};

export type StartPhoneVerificationResponse = {
  challengeId: string;
  maskedPhone: string;
  expiresAt: string;
  resendAvailableAt: string;
  sendsRemaining30m: number;
  sendsRemaining24h: number;
  smsSent: boolean;
};

export type CheckPhoneVerificationRequest = {
  challengeId: string;
  code: string;
};

export type CheckPhoneVerificationResponse = {
  phoneVerified: true;
  phoneMasked: string;
  replacedPrevious: boolean;
};

export type CancelPhoneVerificationRequest = {
  challengeId: string;
};

export type CancelPhoneVerificationResponse = {
  cancelled: true;
  challengeId: string;
};

export type GetPhoneVerificationStateResponse = {
  uiState: PhoneVerificationUiState;
  phoneVerified: boolean;
  phoneMasked: string | null;
  challengeId: string | null;
  expiresAt: string | null;
  resendAvailableAt: string | null;
  attemptCount: number | null;
  attemptsRemaining: number | null;
  sendsRemaining30m: number | null;
  sendsRemaining24h: number | null;
};
