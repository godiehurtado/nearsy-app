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
       * iOS Limited Login: the OIDC `idToken` + original `rawNonce` is the
       * primary credential. `accessToken` is only a fallback when the SDK
       * returns no usable AuthenticationToken.
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
