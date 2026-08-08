/**
 * Non-Android stub — LinkedIn OIDC PoC is Android-only.
 */
import type { LinkedInOidcPocSanitizedResult } from './linkedinOidcPocResultStore';

export const LINKEDIN_OIDC_PROVIDER_ID = 'oidc.linkedin';

export type LinkedInOidcPocErrorCode =
  | 'NOT_ANDROID'
  | 'POC_DISABLED'
  | 'WRONG_FIREBASE_ENV'
  | 'IN_PROGRESS'
  | 'CANCELLED'
  | 'ACCOUNT_EXISTS'
  | 'OPERATION_NOT_ALLOWED'
  | 'NETWORK'
  | 'INVALID_CREDENTIAL'
  | 'UNKNOWN';

export class LinkedInOidcPocError extends Error {
  readonly code: LinkedInOidcPocErrorCode;
  readonly firebaseCode?: string;

  constructor(
    code: LinkedInOidcPocErrorCode,
    message: string,
    firebaseCode?: string,
  ) {
    super(message);
    this.name = 'LinkedInOidcPocError';
    this.code = code;
    this.firebaseCode = firebaseCode;
  }
}

export function isLinkedInOidcPocEnabled(): boolean {
  return false;
}

export async function signInWithLinkedInOidcPoc(): Promise<LinkedInOidcPocSanitizedResult> {
  throw new LinkedInOidcPocError('NOT_ANDROID', 'PoC is Android-only.');
}

export async function signOutLinkedInOidcPoc(): Promise<void> {
  /* no-op */
}

export function formatLinkedInOidcPocSummary(
  result: LinkedInOidcPocSanitizedResult,
): string {
  return `outcome: ${result.outcome}`;
}
