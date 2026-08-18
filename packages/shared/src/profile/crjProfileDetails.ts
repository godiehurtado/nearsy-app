import type { ModePresentation, ProfileMode } from './profileModeFields';

export function isCrjProfileDetailsValid(input: {
  mode: ProfileMode | null;
  occupation: string;
  bio: string;
  company?: string;
}): boolean {
  if (!input.mode) return false;
  if (!input.occupation.trim() || !input.bio.trim()) return false;
  if (input.mode === 'professional' && !input.company?.trim()) {
    return false;
  }
  return true;
}

/** CRJ Details save shape — never includes status. */
export function buildCrjDetailsPresentation(input: {
  mode: ProfileMode;
  occupation: string;
  bio: string;
  company?: string;
}): ModePresentation {
  return {
    occupation: input.occupation.trim(),
    bio: input.bio.trim(),
    ...(input.mode === 'professional'
      ? { company: input.company?.trim() ?? '' }
      : {}),
  };
}
