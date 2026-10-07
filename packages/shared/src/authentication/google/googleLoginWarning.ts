/**
 * Preventive warning before Google from the Login screen (ENH-AUTH-LINK-01).
 *
 * Firebase may replace an existing email/password or Facebook provider when
 * someone signs in directly with Google using the same email. Login warns
 * first and points to More → Sign-in methods. Nothing is looked up by email
 * and nothing about existing accounts is revealed. Welcome and Sign-in
 * methods never use this warning.
 */

export const GOOGLE_LOGIN_WARNING_KEYS = {
  title: 'authentication.login.googleWarning.title',
  message: 'authentication.login.googleWarning.message',
  back: 'authentication.login.googleWarning.back',
  continue: 'authentication.login.googleWarning.continue',
} as const;

export type GoogleLoginWarningResult = 'started' | 'cancelled' | 'ignored';

/**
 * Single-flight gate: locked from the tap until the Google attempt ends, so a
 * double tap can never show two warnings or start two attempts.
 */
export function createGoogleLoginWarningGate() {
  let locked = false;
  return async function requestGoogleLogin(
    confirm: () => Promise<boolean>,
    startGoogleSignIn: () => void | Promise<void>,
  ): Promise<GoogleLoginWarningResult> {
    if (locked) return 'ignored';
    locked = true;
    try {
      let proceed = false;
      try {
        proceed = await confirm();
      } catch {
        proceed = false;
      }
      if (!proceed) return 'cancelled';
      await startGoogleSignIn();
      return 'started';
    } finally {
      locked = false;
    }
  };
}
