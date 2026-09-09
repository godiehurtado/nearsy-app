import type { SocialAuthProvider } from './socialAuthProvider';

/**
 * Normalized provider identity result. No native SDK types are allowed here.
 */
export interface ProviderAuthenticationResult {
  provider: SocialAuthProvider;
  providerUserId: string;
  idToken?: string;
  accessToken?: string;
  /** Apple: raw nonce paired with the hashed nonce sent to Apple Sign-In. */
  rawNonce?: string;
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
