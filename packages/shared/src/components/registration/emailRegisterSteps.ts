/**
 * Email-registration wizard order. Birth Date appears exactly once,
 * after Password and before Terms acceptance.
 *
 * Phone capture + OTP verification happen after account creation via the
 * central onboarding gate (PhoneVerificationScreen).
 *
 * Social auth does not use this sequence.
 */
export const EMAIL_REGISTER_STEPS = [
  'email',
  'password',
  'birth',
  'terms',
] as const;

export type EmailRegisterStep = (typeof EMAIL_REGISTER_STEPS)[number];

export function emailRegisterStepAt(
  index: number,
): EmailRegisterStep | undefined {
  return EMAIL_REGISTER_STEPS[index];
}

export function previousEmailRegisterStep(
  index: number,
): EmailRegisterStep | 'welcome' {
  if (index <= 0) return 'welcome';
  return EMAIL_REGISTER_STEPS[index - 1]!;
}

export function nextEmailRegisterStep(
  index: number,
): EmailRegisterStep | 'submit' {
  const next = EMAIL_REGISTER_STEPS[index + 1];
  return next ?? 'submit';
}

export function birthDateStepCount(steps: readonly string[] = EMAIL_REGISTER_STEPS): number {
  return steps.filter((step) => step === 'birth').length;
}
