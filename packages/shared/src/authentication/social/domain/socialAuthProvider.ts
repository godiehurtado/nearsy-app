/**
 * Provider identifiers for social authentication (ADR-010 / TS-006).
 */
export type SocialAuthProvider = 'google' | 'apple' | 'meta' | 'linkedin';

export interface SocialAuthenticationRequest {
  provider: SocialAuthProvider;
  interactive: boolean;
}
