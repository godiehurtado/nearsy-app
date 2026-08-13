import type { LinkedInA3StartSmokeReport } from './linkedInAuthStartSmokeTypes';

export type { LinkedInA3StartSmokeReport };

export async function buildSmokeClientProofChallenge(): Promise<string> {
  throw new Error('LinkedIn A3 smoke is iOS-only.');
}

export async function runLinkedInAuthStartSmoke(): Promise<LinkedInA3StartSmokeReport> {
  return {
    ok: false,
    hasTransactionId: false,
    hasAuthorizationUrl: false,
    hasExpiresAt: false,
    errorCode: 'LINKEDIN_DISABLED',
  };
}
