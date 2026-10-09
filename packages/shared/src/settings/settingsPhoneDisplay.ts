/**
 * Settings → Mobile number, read-only (Nearsy 2.0.8).
 * The phone is only set or replaced through backend OTP; Settings never
 * writes `phone`, `phoneVerified` or `phoneVerifiedAt`.
 */

export type SettingsPhoneStatus = 'verified' | 'unverified';

export type SettingsPhoneDisplay = {
  status: SettingsPhoneStatus;
  phone: string | null;
  value: string;
};

export function resolveSettingsPhoneDisplay(input: {
  phone: unknown;
  phoneVerified: unknown;
  labels: { verified: string; notVerified: string };
}): SettingsPhoneDisplay {
  const phone =
    typeof input.phone === 'string' && input.phone.trim()
      ? input.phone.trim()
      : null;
  const verified = input.phoneVerified === true;

  if (verified) {
    return { status: 'verified', phone, value: phone ?? input.labels.verified };
  }
  return {
    status: 'unverified',
    phone,
    value: phone
      ? `${phone} · ${input.labels.notVerified}`
      : input.labels.notVerified,
  };
}
