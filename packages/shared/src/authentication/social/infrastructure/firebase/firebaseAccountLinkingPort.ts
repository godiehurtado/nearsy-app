/**
 * Snapshot of the signed-in Firebase user for the Sign-in methods screen.
 * `providerIds` come from `User.providerData` (e.g. `password`, `google.com`).
 */
export interface LinkedAccountSnapshot {
  uid: string;
  providerIds: readonly string[];
}

export interface FirebaseFacebookOidcLinkInput {
  /** UID captured before the Facebook sheet opened; the link aborts if it changed. */
  expectedUid: string;
  idToken: string;
  rawNonce: string;
}

/**
 * Links a provider credential to the CURRENT user only. Implementations must
 * never call `signInWithCredential`, create users or look up accounts by email.
 */
export interface FirebaseAccountLinkingPort {
  getCurrentAccount(): LinkedAccountSnapshot | null;
  linkFacebookOidcCredential(
    input: FirebaseFacebookOidcLinkInput,
  ): Promise<LinkedAccountSnapshot>;
  reloadCurrentAccount(): Promise<LinkedAccountSnapshot | null>;
}
