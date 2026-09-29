/** Minimal expo-crypto surface needed for OIDC nonce pairing. */
export type SecureNonceCryptoClient = {
  digestStringAsync: (algorithm: unknown, data: string) => Promise<string>;
  CryptoDigestAlgorithm: { SHA256: unknown };
  getRandomBytesAsync: (byteCount: number) => Promise<Uint8Array>;
};

export const SECURE_RAW_NONCE_LENGTH = 32;

const NONCE_CHARSET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Cryptographically secure alphanumeric nonce. Rejection sampling avoids
 * modulo bias; never falls back to a weak PRNG. Throws a plain Error on failure.
 */
export async function createSecureRawNonce(
  crypto: SecureNonceCryptoClient,
  length: number = SECURE_RAW_NONCE_LENGTH,
): Promise<string> {
  if (typeof crypto?.getRandomBytesAsync !== 'function') {
    throw new Error('secure_random_unavailable');
  }

  const charsetLength = NONCE_CHARSET.length;
  const unbiasedLimit = Math.floor(256 / charsetLength) * charsetLength;
  const chars: string[] = [];

  while (chars.length < length) {
    const bytes = await crypto.getRandomBytesAsync(64);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      throw new Error('empty_random_bytes');
    }
    for (let i = 0; i < bytes.length && chars.length < length; i += 1) {
      const value = bytes[i]!;
      if (value < unbiasedLimit) {
        chars.push(NONCE_CHARSET[value % charsetLength]!);
      }
    }
  }

  return chars.join('');
}

export async function sha256Hex(
  crypto: SecureNonceCryptoClient,
  value: string,
): Promise<string> {
  return crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, value);
}
