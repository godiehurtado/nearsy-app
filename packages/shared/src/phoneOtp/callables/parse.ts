/**
 * Strict parsers for Phone OTP callable responses.
 */

import { OTP_CODE_LENGTH } from './wireTypes';
import type {
  CancelPhoneVerificationResponse,
  CheckPhoneVerificationResponse,
  GetPhoneVerificationStateResponse,
  PhoneOtpLocale,
  PhoneVerificationUiState,
  StartPhoneVerificationResponse,
} from './wireTypes';
import { createPhoneOtpContractError } from './errors';

const UI_STATES = new Set<PhoneVerificationUiState>([
  'none',
  'pending',
  'sending',
  'checking',
  'expired',
  'cancelled',
  'locked',
  'failed',
  'verified',
]);

const LOCALES = new Set<PhoneOtpLocale>(['en', 'es']);

function isIsoString(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw createPhoneOtpContractError(`Invalid ${field}.`);
  }
  return value.trim();
}

function parseNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw createPhoneOtpContractError(`Invalid ${field}.`);
  }
  return value;
}

function parseNullableNonNegativeInt(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return parseNonNegativeInt(value, field);
}

function parseUiState(value: unknown): PhoneVerificationUiState {
  if (typeof value !== 'string' || !UI_STATES.has(value as PhoneVerificationUiState)) {
    throw createPhoneOtpContractError('Invalid uiState.');
  }
  return value as PhoneVerificationUiState;
}

export function parseStartPhoneVerificationResponse(
  data: unknown,
): StartPhoneVerificationResponse {
  if (!data || typeof data !== 'object') {
    throw createPhoneOtpContractError('Invalid start response.');
  }
  const raw = data as Record<string, unknown>;
  return {
    challengeId: parseNonEmptyString(raw.challengeId, 'challengeId'),
    maskedPhone: parseNonEmptyString(raw.maskedPhone, 'maskedPhone'),
    expiresAt: parseIsoTimestamp(raw.expiresAt, 'expiresAt'),
    resendAvailableAt: parseIsoTimestamp(raw.resendAvailableAt, 'resendAvailableAt'),
    sendsRemaining30m: parseNonNegativeInt(raw.sendsRemaining30m, 'sendsRemaining30m'),
    sendsRemaining24h: parseNonNegativeInt(raw.sendsRemaining24h, 'sendsRemaining24h'),
    smsSent: raw.smsSent === true,
  };
}

export function parseCheckPhoneVerificationResponse(
  data: unknown,
): CheckPhoneVerificationResponse {
  if (!data || typeof data !== 'object') {
    throw createPhoneOtpContractError('Invalid check response.');
  }
  const raw = data as Record<string, unknown>;
  if (raw.phoneVerified !== true) {
    throw createPhoneOtpContractError('Invalid phoneVerified.');
  }
  return {
    phoneVerified: true,
    phoneMasked: parseNonEmptyString(raw.phoneMasked, 'phoneMasked'),
    replacedPrevious: raw.replacedPrevious === true,
  };
}

export function parseCancelPhoneVerificationResponse(
  data: unknown,
): CancelPhoneVerificationResponse {
  if (!data || typeof data !== 'object') {
    throw createPhoneOtpContractError('Invalid cancel response.');
  }
  const raw = data as Record<string, unknown>;
  if (raw.cancelled !== true) {
    throw createPhoneOtpContractError('Invalid cancelled flag.');
  }
  return {
    cancelled: true,
    challengeId: parseNonEmptyString(raw.challengeId, 'challengeId'),
  };
}

export function parseGetPhoneVerificationStateResponse(
  data: unknown,
): GetPhoneVerificationStateResponse {
  if (!data || typeof data !== 'object') {
    throw createPhoneOtpContractError('Invalid getState response.');
  }
  const raw = data as Record<string, unknown>;
  return {
    uiState: parseUiState(raw.uiState),
    phoneVerified: raw.phoneVerified === true,
    phoneMasked:
      raw.phoneMasked === null
        ? null
        : parseNonEmptyString(raw.phoneMasked, 'phoneMasked'),
    challengeId:
      raw.challengeId === null
        ? null
        : parseNonEmptyString(raw.challengeId, 'challengeId'),
    expiresAt:
      raw.expiresAt === null
        ? null
        : parseIsoTimestamp(raw.expiresAt, 'expiresAt'),
    resendAvailableAt:
      raw.resendAvailableAt === null
        ? null
        : parseIsoTimestamp(raw.resendAvailableAt, 'resendAvailableAt'),
    attemptCount: parseNullableNonNegativeInt(raw.attemptCount, 'attemptCount'),
    attemptsRemaining: parseNullableNonNegativeInt(
      raw.attemptsRemaining,
      'attemptsRemaining',
    ),
    sendsRemaining30m: parseNullableNonNegativeInt(
      raw.sendsRemaining30m,
      'sendsRemaining30m',
    ),
    sendsRemaining24h: parseNullableNonNegativeInt(
      raw.sendsRemaining24h,
      'sendsRemaining24h',
    ),
  };
}

function parseIsoTimestamp(value: unknown, field: string): string {
  if (!isIsoString(value)) {
    throw createPhoneOtpContractError(`Invalid ${field}.`);
  }
  return value.trim();
}

export function serializeStartPhoneVerificationRequest(
  request: { phoneE164: string; locale?: PhoneOtpLocale },
): Record<string, unknown> {
  const locale =
    request.locale && LOCALES.has(request.locale) ? request.locale : undefined;
  return {
    phoneE164: request.phoneE164,
    ...(locale ? { locale } : {}),
  };
}

export function serializeCheckPhoneVerificationRequest(request: {
  challengeId: string;
  code: string;
}): Record<string, unknown> {
  const code = String(request.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw createPhoneOtpContractError('Invalid code.');
  }
  return {
    challengeId: request.challengeId,
    code,
  };
}

export function serializeCancelPhoneVerificationRequest(request: {
  challengeId: string;
}): Record<string, unknown> {
  return { challengeId: request.challengeId };
}

export function isValidOtpCode(value: string): boolean {
  return new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`).test(value);
}
