import type { PhoneOtpClient } from './callables/port.ts';

/** Non-Android stub — Phone OTP client is Android-scoped for J03. */
export function getPhoneOtpClient(): Promise<PhoneOtpClient> {
  return Promise.reject(
    new Error('Phone OTP client is only available on Android.'),
  );
}

export function resetPhoneOtpClientForTests(): void {
  // no-op
}
