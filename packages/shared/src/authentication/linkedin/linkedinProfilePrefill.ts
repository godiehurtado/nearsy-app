import type { LinkedInProfileHints } from './linkedinAuthCore.ts';
import {
  buildGoogleProfilePrefill,
  type GoogleProfilePrefill,
} from '../googleProfilePrefillStore.ts';

/** Map Exchange profileHints to the shared CRJ prefill contract. */
export function linkedInProfileHintsToSocialPrefill(
  hints: LinkedInProfileHints | undefined,
): GoogleProfilePrefill | undefined {
  if (!hints) return undefined;
  const prefill = buildGoogleProfilePrefill({
    givenName: hints.givenName,
    familyName: hints.familyName,
    displayName: hints.displayName,
    photoUrl: hints.photoUrl,
  });
  return Object.keys(prefill).length > 0 ? prefill : undefined;
}
