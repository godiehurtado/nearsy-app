export type FacebookCredentialTokens =
  | { kind: 'oidc'; idToken: string; rawNonce: string }
  | { kind: 'access_token'; accessToken: string };

function trimToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * iOS Limited Login policy: the OIDC authentication token + original raw nonce
 * is the primary Firebase credential. A classic AccessToken is only a fallback
 * when no usable OIDC pair exists — under Limited Login the SDK may expose a
 * residual AccessToken that the Graph API rejects.
 */
export function selectFacebookCredentialTokens(input: {
  accessToken?: string | null;
  idToken?: string | null;
  rawNonce?: string | null;
}): FacebookCredentialTokens | null {
  const idToken = trimToUndefined(input.idToken);
  const rawNonce = trimToUndefined(input.rawNonce);
  if (idToken && rawNonce) return { kind: 'oidc', idToken, rawNonce };
  const accessToken = trimToUndefined(input.accessToken);
  if (accessToken) return { kind: 'access_token', accessToken };
  return null;
}
