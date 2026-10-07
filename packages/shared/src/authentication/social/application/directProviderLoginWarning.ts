/**
 * Preventive warning before a direct Google / Apple sign-in from Login.
 *
 * With "one account per email", Firebase may replace an existing email/password
 * or Facebook method when the same email signs in with a trusted provider. The
 * warning never looks up accounts or methods by email and reveals nothing; it
 * only reminds existing users to connect new methods from Sign-in methods.
 */
export type AuthEntrySurface = 'login' | 'welcome';

export type DirectLoginWarningProvider = 'google' | 'apple';

export const DIRECT_LOGIN_WARNING_TITLE_KEY = 'authentication.login.providerWarning.title';
export const DIRECT_LOGIN_WARNING_MESSAGE_KEY = 'authentication.login.providerWarning.message';
export const DIRECT_LOGIN_WARNING_BACK_KEY = 'authentication.login.providerWarning.back';
export const DIRECT_LOGIN_WARNING_CONTINUE_KEYS: Record<DirectLoginWarningProvider, string> = {
  google: 'authentication.login.providerWarning.continueGoogle',
  apple: 'authentication.login.providerWarning.continueApple',
};

/** Only Login (existing users) + Google / Apple + iOS. */
export function shouldWarnBeforeDirectProviderLogin(
  surface: AuthEntrySurface,
  provider: string,
  platformOS: string,
): boolean {
  return (
    surface === 'login' &&
    platformOS === 'ios' &&
    (provider === 'google' || provider === 'apple')
  );
}
