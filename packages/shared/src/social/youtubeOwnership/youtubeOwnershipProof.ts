/**
 * S256 client possession proof for YouTube ownership (independent of login).
 */

import {
  BASE64URL_RE,
  MAX_CLIENT_PROOF_CHALLENGE_LEN,
  MAX_CLIENT_PROOF_VERIFIER_LEN,
  MIN_CLIENT_PROOF_CHALLENGE_LEN,
  MIN_CLIENT_PROOF_VERIFIER_LEN,
  YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD,
} from './youtubeOwnershipContract.ts';

export type ClientProofCrypto = {
  getRandomBytes: (byteCount: number) => Uint8Array | Promise<Uint8Array>;
  sha256: (utf8: string) => Uint8Array | Promise<Uint8Array>;
};

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function assertClientProofChallengeShape(challenge: string): void {
  if (
    typeof challenge !== 'string' ||
    challenge.length < MIN_CLIENT_PROOF_CHALLENGE_LEN ||
    challenge.length > MAX_CLIENT_PROOF_CHALLENGE_LEN ||
    !BASE64URL_RE.test(challenge)
  ) {
    throw new Error('INVALID_CLIENT_PROOF_CHALLENGE');
  }
}

export function assertClientProofVerifierShape(verifier: string): void {
  if (
    typeof verifier !== 'string' ||
    verifier.length < MIN_CLIENT_PROOF_VERIFIER_LEN ||
    verifier.length > MAX_CLIENT_PROOF_VERIFIER_LEN ||
    !BASE64URL_RE.test(verifier)
  ) {
    throw new Error('INVALID_CLIENT_PROOF_VERIFIER');
  }
}

export async function generateClientProofVerifier(
  crypto: ClientProofCrypto,
  byteCount = 32,
): Promise<string> {
  const bytes = await Promise.resolve(crypto.getRandomBytes(byteCount));
  const verifier = bytesToBase64Url(bytes);
  assertClientProofVerifierShape(verifier);
  return verifier;
}

export async function createS256ClientProofChallenge(
  crypto: ClientProofCrypto,
  clientProofVerifier: string,
): Promise<string> {
  assertClientProofVerifierShape(clientProofVerifier);
  const digest = await Promise.resolve(crypto.sha256(clientProofVerifier));
  const challenge = bytesToBase64Url(digest);
  assertClientProofChallengeShape(challenge);
  return challenge;
}

export async function createClientProofPair(crypto: ClientProofCrypto): Promise<{
  clientProofVerifier: string;
  clientProofChallenge: string;
  clientProofMethod: typeof YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD;
}> {
  const clientProofVerifier = await generateClientProofVerifier(crypto);
  const clientProofChallenge = await createS256ClientProofChallenge(
    crypto,
    clientProofVerifier,
  );
  return {
    clientProofVerifier,
    clientProofChallenge,
    clientProofMethod: YOUTUBE_OWNERSHIP_CLIENT_PROOF_METHOD,
  };
}
