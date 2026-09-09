import type { SocialAuthProvider } from './socialAuthProvider';

/**
 * Provider-neutral profile metadata safe for UI prefill (TS-008 / ADR-008).
 * Never includes tokens, credentials, or raw native SDK payloads.
 */
export interface SocialProfileData {
  provider: SocialAuthProvider;
  providerUserId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  photoUrl?: string;
  locale?: string;
}
