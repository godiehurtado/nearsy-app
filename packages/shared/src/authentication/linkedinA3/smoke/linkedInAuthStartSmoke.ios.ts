/**
 * Dev-only smoke helper for I1. Not wired into UI.
 * Owner must invoke manually after a Development build with App Check ready.
 *
 * Does not open a browser, call Exchange, or sign in.
 */

import { getLinkedInA3CallableClient } from '../iosLinkedInA3Foundation';
import {
  sanitizeAuthorizationUrl,
  sanitizeTransactionId,
} from '../sanitize';
import type { LinkedInA3StartSmokeReport } from './linkedInAuthStartSmokeTypes';

export type { LinkedInA3StartSmokeReport };

/**
 * Generate a valid-looking S256 challenge for smoke without exposing verifier logic yet.
 * Production OAuth (I3) will use SecureStore + proper verifier generation.
 */
export async function buildSmokeClientProofChallenge(): Promise<string> {
  const crypto = await import('expo-crypto');
  const bytes = await crypto.getRandomBytesAsync(32);
  // Hex is sufficient for Start smoke (Exchange not invoked in I1).
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function runLinkedInAuthStartSmoke(): Promise<LinkedInA3StartSmokeReport> {
  try {
    const client = await getLinkedInA3CallableClient();
    const clientProofChallenge = await buildSmokeClientProofChallenge();
    const result = await client.start({
      platform: 'ios',
      clientProofChallenge,
      clientProofMethod: 'S256',
    });

    return {
      ok: true,
      hasTransactionId: true,
      hasAuthorizationUrl: true,
      hasExpiresAt: Number.isFinite(result.expiresAt),
      transactionIdSanitized: sanitizeTransactionId(result.transactionId),
      authorizationHostPath: sanitizeAuthorizationUrl(result.authorizationUrl),
    };
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : 'CALLABLE_FAILED';
    return {
      ok: false,
      hasTransactionId: false,
      hasAuthorizationUrl: false,
      hasExpiresAt: false,
      errorCode: code,
    };
  }
}
