/**
 * Nearsy client possession proof (S256) for LinkedIn A3.
 * Not LinkedIn OAuth PKCE — never send verifier on Start.
 */

export const CLIENT_PROOF_METHOD_S256 = 'S256' as const;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
export const MIN_CLIENT_PROOF_LEN = 43;
export const MAX_CLIENT_PROOF_LEN = 128;

export type ClientProofCrypto = {
  getRandomBytes: (count: number) => Uint8Array | Promise<Uint8Array>;
  /** SHA-256 digest of UTF-8 string → raw 32 bytes. */
  sha256: (value: string) => Uint8Array | Promise<Uint8Array>;
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

export function assertClientProofVerifierShape(verifier: string): void {
  if (
    typeof verifier !== 'string' ||
    verifier.length < MIN_CLIENT_PROOF_LEN ||
    verifier.length > MAX_CLIENT_PROOF_LEN ||
    !BASE64URL_RE.test(verifier)
  ) {
    throw new Error('INVALID_CLIENT_PROOF_VERIFIER');
  }
}

export function assertClientProofChallengeShape(challenge: string): void {
  if (
    typeof challenge !== 'string' ||
    challenge.length < MIN_CLIENT_PROOF_LEN ||
    challenge.length > MAX_CLIENT_PROOF_LEN ||
    !BASE64URL_RE.test(challenge)
  ) {
    throw new Error('INVALID_CLIENT_PROOF_CHALLENGE');
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
  clientProofMethod: typeof CLIENT_PROOF_METHOD_S256;
}> {
  const clientProofVerifier = await generateClientProofVerifier(crypto);
  const clientProofChallenge = await createS256ClientProofChallenge(
    crypto,
    clientProofVerifier,
  );
  return {
    clientProofVerifier,
    clientProofChallenge,
    clientProofMethod: CLIENT_PROOF_METHOD_S256,
  };
}

/** Expo-crypto backed implementation (no SecureStore). */
export async function createExpoClientProofCrypto(): Promise<ClientProofCrypto> {
  const Crypto = await import('expo-crypto');
  return {
    getRandomBytes: (count) => Crypto.getRandomBytesAsync(count),
    async sha256(value) {
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        value,
        { encoding: Crypto.CryptoEncoding.BASE64 },
      );
      // BASE64 → raw bytes
      const normalized = digest.replace(/-/g, '+').replace(/_/g, '/');
      const pad =
        normalized.length % 4 === 0
          ? normalized
          : normalized + '='.repeat(4 - (normalized.length % 4));
      const binary =
        typeof globalThis.atob === 'function'
          ? globalThis.atob(pad)
          : Buffer.from(pad, 'base64').toString('binary');
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    },
  };
}
