import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import type { SocialProfileData } from '../domain/socialProfileData';

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Strip tokens and normalize provider result into UI-safe social profile data.
 * Fail-soft: never throws for malformed optional fields.
 */
export function normalizeSocialProfileData(
  result: ProviderAuthenticationResult,
): SocialProfileData {
  return {
    provider: result.provider,
    providerUserId: trimToUndefined(result.providerUserId),
    email: trimToUndefined(result.email),
    emailVerified:
      typeof result.emailVerified === 'boolean'
        ? result.emailVerified
        : undefined,
    displayName: trimToUndefined(result.displayName),
    givenName: trimToUndefined(result.givenName),
    familyName: trimToUndefined(result.familyName),
    photoUrl: trimToUndefined(result.photoUrl),
    locale: trimToUndefined(result.locale),
  };
}
