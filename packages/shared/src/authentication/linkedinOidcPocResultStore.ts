/**
 * LinkedIn OIDC PoC — in-memory last result (sanitized).
 * Never persist to AsyncStorage / Firestore / disk.
 */

export type LinkedInOidcPocOutcome =
  | 'success'
  | 'cancelled'
  | 'failed'
  | 'blocked';

export type LinkedInOidcPocSanitizedResult = {
  outcome: LinkedInOidcPocOutcome;
  at: number;
  firebaseUidMasked?: string;
  isNewUser?: boolean | null;
  providerIds?: string[];
  emailPresent?: boolean;
  emailVerified?: boolean | null;
  displayNamePresent?: boolean;
  photoUrlPresent?: boolean;
  localePresent?: boolean;
  additionalProfileKeys?: string[];
  providerDataCount?: number;
  errorCode?: string;
  errorMessageSanitized?: string;
  note?: string;
};

let last: LinkedInOidcPocSanitizedResult | null = null;

export function setLinkedInOidcPocResult(
  result: LinkedInOidcPocSanitizedResult,
): void {
  last = result;
}

export function getLinkedInOidcPocResult(): LinkedInOidcPocSanitizedResult | null {
  return last;
}

export function clearLinkedInOidcPocResult(): void {
  last = null;
}

export function maskUid(uid: string | null | undefined): string {
  if (!uid) return '(none)';
  if (uid.length <= 8) return `${uid.slice(0, 2)}***`;
  return `${uid.slice(0, 4)}***${uid.slice(-3)}`;
}
