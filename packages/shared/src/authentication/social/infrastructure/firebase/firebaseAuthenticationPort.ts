/**
 * Firebase social credential port (ADR-010 / TS-006).
 * Platform adapters must return Nearsy-owned primitives only.
 */
export type FirebaseSocialCredentialInput =
  | {
      provider: 'google';
      idToken: string;
      accessToken?: string;
    }
  | {
      provider: 'apple';
      identityToken: string;
      rawNonce: string;
    }
  | {
      /**
       * Classic Facebook Login provides `accessToken`. Without ATT the iOS SDK
       * falls back to Limited Login and provides an OIDC `idToken` + `rawNonce`.
       */
      provider: 'facebook';
      accessToken?: string;
      idToken?: string;
      rawNonce?: string;
    };

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
