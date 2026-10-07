/**
 * Snapshot of the signed-in Firebase user for the Sign-in methods screen.
 * `providerIds` come from `User.providerData` (e.g. `password`, `google.com`).
 */
export interface LinkedAccountSnapshot {
  uid: string;
  providerIds: readonly string[];
}

/** Fresh provider tokens, held in memory only for one linking attempt. */
export type LinkCredentialInput =
  | { provider: 'google'; idToken: string; accessToken?: string }
  | { provider: 'apple'; idToken: string; rawNonce: string }
  | { provider: 'facebook'; idToken: string; rawNonce: string };

export interface FirebaseProviderLinkInput {
  /** UID captured before the provider sheet opened; the link aborts if it changed. */
  expectedUid: string;
  credential: LinkCredentialInput;
}

/**
 * Links a provider credential to the CURRENT user only. Implementations must
 * never call `signInWithCredential`, create users or look up accounts by email.
 */
export interface FirebaseAccountLinkingPort {
  getCurrentAccount(): LinkedAccountSnapshot | null;
  linkProviderCredential(input: FirebaseProviderLinkInput): Promise<LinkedAccountSnapshot>;
  reloadCurrentAccount(): Promise<LinkedAccountSnapshot | null>;
}
