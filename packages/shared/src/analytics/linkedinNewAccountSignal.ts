/**
 * LinkedIn sign-in does not say whether it created the account, so it sends no
 * `signup_completed`. This is the only place that may read that signal, and it
 * never infers it from timing, profile state or a local marker.
 *
 * When Identity agrees on the response field, set its name here and, at the two
 * `performSignInOnce` calls of `authentication/linkedin/linkedinSession.ts`, call
 * `trackSignupCompleted(uid)` when this returns true.
 */
export const LINKEDIN_NEW_ACCOUNT_FIELD: string | null = null;

export function readLinkedinNewAccountSignal(
  response: unknown,
  field: string | null = LINKEDIN_NEW_ACCOUNT_FIELD,
): boolean {
  if (!field || !response || typeof response !== 'object') return false;
  return (response as Record<string, unknown>)[field] === true;
}
