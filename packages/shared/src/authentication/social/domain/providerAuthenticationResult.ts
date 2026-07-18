import type { SocialAuthProvider } from './socialAuthProvider';

/**
 * Normalized provider identity result. No native SDK types are allowed here.
 */
export interface ProviderAuthenticationResult {
  provider: SocialAuthProvider;
  providerUserId: string;
  idToken?: string;
  accessToken?: string;
  authorizationCode?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  photoUrl?: string;
  locale?: string;
  grantedScopes?: string[];
}
