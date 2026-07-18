/**
 * Firebase social credential port (ADR-010 / TS-006).
 * Platform adapters must return Nearsy-owned primitives only.
 */
export interface FirebaseSocialCredentialInput {
  provider: 'google';
  idToken: string;
  accessToken?: string;
}

export interface FirebaseAuthenticationSession {
  uid: string;
  email?: string;
  isNewUser: boolean;
  linkedProviderIds: string[];
}

export interface FirebaseAuthenticationPort {
  signInWithSocialCredential(
    input: FirebaseSocialCredentialInput,
  ): Promise<FirebaseAuthenticationSession>;
}
