import type { PhoneOtpClient } from './callables/port';

export function getPhoneOtpClient(): Promise<PhoneOtpClient> {
  return Promise.reject(
    new Error('Phone OTP client is only available on iOS.'),
  );
}

export function resetPhoneOtpClientForTests(): void {
  // no-op
}
