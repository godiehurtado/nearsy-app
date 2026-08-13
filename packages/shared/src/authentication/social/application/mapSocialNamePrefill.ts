import type { SocialProfileData } from '../domain/socialProfileData';

/**
 * CRJ identity prefill from social providers.
 * given/family when present; displayName only fills Name (not Last Name).
 * Never invents a fragile split of displayName into last name.
 */
export type SocialNamePrefill = {
  firstName: string;
  lastName: string;
};

function trimOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function mapSocialProfileToNamePrefill(
  social: Pick<SocialProfileData, 'givenName' | 'familyName' | 'displayName'>,
): SocialNamePrefill {
  const given = trimOrEmpty(social.givenName);
  const family = trimOrEmpty(social.familyName);
  if (given || family) {
    return { firstName: given, lastName: family };
  }

  const display = trimOrEmpty(social.displayName);
  return { firstName: display, lastName: '' };
}
