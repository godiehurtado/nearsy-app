import type { PhoneOtpClient } from './callables/port.ts';

/** iOS foundation lives on develop-ios; Android uses phoneOtpFoundation.android.ts. */
export function getPhoneOtpClient(): Promise<PhoneOtpClient> {
  return Promise.reject(new Error('Phone OTP iOS foundation is not in the Android tree.'));
}

export function resetPhoneOtpClientForTests(): void {}
