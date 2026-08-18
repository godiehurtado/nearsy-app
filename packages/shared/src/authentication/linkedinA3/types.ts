export type LinkedInA3Platform = 'ios' | 'android';

export type LinkedInAuthStartInput = {
  platform: LinkedInA3Platform;
  clientProofChallenge: string;
  clientProofMethod: 'S256';
};

export type LinkedInAuthStartResult = {
  transactionId: string;
  authorizationUrl: string;
  expiresAt: number;
};

export type LinkedInAuthExchangeInput = {
  transactionId: string;
  clientProofVerifier: string;
};

export type LinkedInAuthProfileHints = {
  givenName?: string;
  familyName?: string;
  displayName?: string;
  photoUrl?: string;
};

export type LinkedInAuthExchangeResult = {
  customToken: string;
  profileHints?: LinkedInAuthProfileHints;
};

export function assertLinkedInAuthStartInput(
  input: LinkedInAuthStartInput,
): void {
  if (input.platform !== 'ios' && input.platform !== 'android') {
    throw new Error('platform must be ios or android');
  }
  if (input.clientProofMethod !== 'S256') {
    throw new Error('clientProofMethod must be S256');
  }
  if (
    typeof input.clientProofChallenge !== 'string' ||
    input.clientProofChallenge.length < 16
  ) {
    throw new Error('clientProofChallenge is required');
  }
}

export function assertLinkedInAuthStartResult(
  data: unknown,
): LinkedInAuthStartResult {
  if (!data || typeof data !== 'object') {
    throw new Error('invalid start response');
  }
  const record = data as Record<string, unknown>;
  const transactionId = record.transactionId;
  const authorizationUrl = record.authorizationUrl;
  const expiresAt = record.expiresAt;

  if (typeof transactionId !== 'string' || transactionId.length < 8) {
    throw new Error('invalid transactionId');
  }
  if (typeof authorizationUrl !== 'string' || authorizationUrl.length < 8) {
    throw new Error('invalid authorizationUrl');
  }
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    throw new Error('invalid expiresAt');
  }

  return { transactionId, authorizationUrl, expiresAt };
}

export function assertLinkedInAuthExchangeInput(
  input: LinkedInAuthExchangeInput,
): void {
  if (typeof input.transactionId !== 'string' || input.transactionId.length < 8) {
    throw new Error('transactionId is required');
  }
  if (
    typeof input.clientProofVerifier !== 'string' ||
    input.clientProofVerifier.length < 16
  ) {
    throw new Error('clientProofVerifier is required');
  }
}

function trimOptionalHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalProfileHints(
  raw: unknown,
): LinkedInAuthProfileHints | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const givenName = trimOptionalHint(record.givenName);
  const familyName = trimOptionalHint(record.familyName);
  const displayName = trimOptionalHint(record.displayName);
  const photoUrl = trimOptionalHint(record.photoUrl);
  const hints: LinkedInAuthProfileHints = {
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  };
  return Object.keys(hints).length > 0 ? hints : undefined;
}

/**
 * Accepts current backends `{ customToken }` and optional `profileHints`.
 * Malformed hints are ignored; a valid customToken still succeeds.
 */
export function assertLinkedInAuthExchangeResult(
  data: unknown,
): LinkedInAuthExchangeResult {
  if (!data || typeof data !== 'object') {
    throw new Error('invalid exchange response');
  }
  const record = data as Record<string, unknown>;
  const customToken = record.customToken;
  if (typeof customToken !== 'string' || customToken.length < 8) {
    throw new Error('invalid customToken');
  }
  const profileHints = parseOptionalProfileHints(record.profileHints);
  return profileHints ? { customToken, profileHints } : { customToken };
}
