export const OTP_SIX_DIGIT_LENGTH = 6;

export function sanitizeOtpDigits(
  value: string,
  maxLength: number = OTP_SIX_DIGIT_LENGTH,
): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export function otpDigitCells(
  code: string,
  length: number = OTP_SIX_DIGIT_LENGTH,
): string[] {
  const digits = sanitizeOtpDigits(code, length);
  return Array.from({ length }, (_, index) => digits[index] ?? '');
}

export function activeOtpCellIndex(
  code: string,
  length: number = OTP_SIX_DIGIT_LENGTH,
): number {
  const digits = sanitizeOtpDigits(code, length);
  if (digits.length >= length) return length - 1;
  return digits.length;
}

export function isOtpCodeComplete(
  code: string,
  length: number = OTP_SIX_DIGIT_LENGTH,
): boolean {
  return sanitizeOtpDigits(code, length).length === length;
}
