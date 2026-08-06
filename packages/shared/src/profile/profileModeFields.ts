/**
 * Single source of truth for the NEW dual-profile presentation model (CRJ).
 *
 * Shared: realName (top-level only — never duplicated per mode).
 * Per mode: profileImage, occupation, status, bio (+ company for professional).
 *
 * This module does NOT implement legacy migration. Nested `profiles[mode]` is
 * authoritative for users created through the new onboarding. Optional
 * `projectActiveToTopLevel` mirrors the *active* face to top-level keys so
 * existing Home/Nearby readers keep working for new users — not a migration.
 */

export type ProfileMode = 'personal' | 'professional';

export type ModePresentation = {
  profileImage?: string | null;
  occupation?: string;
  status?: string;
  bio?: string;
  company?: string;
};

export type ProfilesMap = {
  personal?: ModePresentation;
  professional?: ModePresentation;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nonEmptyUri(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Omit undefined and blank strings from write payloads. */
export function omitEmptyWrites(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    out[key] = value;
  }
  return out;
}

export function isProfileMode(value: unknown): value is ProfileMode {
  return value === 'personal' || value === 'professional';
}

/** Active mode from document; null if not chosen yet. */
export function resolveActiveMode(
  data: Record<string, unknown> | null | undefined,
): ProfileMode | null {
  return isProfileMode(data?.mode) ? data.mode : null;
}

/**
 * Resolve presentation for a specific mode from nested profiles[mode].
 * Falls back to top-level only when nested field is empty (read convenience
 * for mid-transition docs — not a migration writer).
 */
export function resolveModePresentation(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): ModePresentation {
  const profiles = (data?.profiles ?? {}) as ProfilesMap;
  const nested = profiles[mode] ?? {};

  return {
    profileImage:
      nonEmptyUri(nested.profileImage) ??
      (data?.mode === mode ? nonEmptyUri(data?.profileImage) : null) ??
      null,
    occupation:
      nonEmptyString(nested.occupation) ??
      (data?.mode === mode ? nonEmptyString(data?.occupation) : null) ??
      '',
    status:
      nonEmptyString(nested.status) ??
      (data?.mode === mode ? nonEmptyString(data?.status) : null) ??
      '',
    bio:
      nonEmptyString(nested.bio) ??
      (data?.mode === mode ? nonEmptyString(data?.bio) : null) ??
      '',
    company:
      nonEmptyString(nested.company) ??
      (data?.mode === mode ? nonEmptyString(data?.company) : null) ??
      '',
  };
}

export function resolveActivePresentation(
  data: Record<string, unknown> | null | undefined,
): ModePresentation {
  const mode = resolveActiveMode(data) ?? 'personal';
  return resolveModePresentation(data, mode);
}

export function resolveActiveProfileImage(
  data: Record<string, unknown> | null | undefined,
): string | null {
  return resolveActivePresentation(data).profileImage ?? null;
}

export type ActiveProfileSaveInput = {
  mode: ProfileMode;
  realName?: string;
  presentation: ModePresentation;
  /** When true (default), also project active face to top-level for current readers. */
  projectActiveToTopLevel?: boolean;
};

/**
 * Build Firestore merge patch for ONE mode only.
 * - Never writes the other mode's nested keys.
 * - Never writes undefined or blank strings.
 * - realName only when non-empty (shared identity).
 * - Does not set visibility or profileSetupCompleted (callers decide).
 */
export function buildActiveProfileSavePatch(
  input: ActiveProfileSaveInput,
): Record<string, unknown> {
  const { mode, presentation } = input;
  const project = input.projectActiveToTopLevel !== false;
  const flat: Record<string, unknown> = { mode };

  const realName = nonEmptyString(input.realName);
  if (realName) flat.realName = realName;

  const nestedEntries: [string, unknown][] = [];
  if (presentation.profileImage !== undefined) {
    const uri = nonEmptyUri(presentation.profileImage);
    if (uri) nestedEntries.push(['profileImage', uri]);
    else if (presentation.profileImage === null) {
      nestedEntries.push(['profileImage', null]);
    }
  }
  if (presentation.occupation !== undefined) {
    const v = nonEmptyString(presentation.occupation);
    if (v) nestedEntries.push(['occupation', v]);
  }
  if (presentation.status !== undefined) {
    const v = nonEmptyString(presentation.status);
    if (v) nestedEntries.push(['status', v]);
  }
  if (presentation.bio !== undefined) {
    const v = nonEmptyString(presentation.bio);
    if (v) nestedEntries.push(['bio', v]);
  }
  if (mode === 'professional' && presentation.company !== undefined) {
    const v = nonEmptyString(presentation.company);
    if (v) nestedEntries.push(['company', v]);
  }

  for (const [key, value] of nestedEntries) {
    flat[`profiles.${mode}.${key}`] = value;
    if (project) {
      flat[key] = value;
    }
  }

  return flat;
}

/** @deprecated Prefer buildActiveProfileSavePatch — kept for call-site migration. */
export function buildModePresentationPatch(
  mode: ProfileMode,
  values: ModePresentation,
  options?: { mirrorLegacy?: boolean },
): Record<string, unknown> {
  return buildActiveProfileSavePatch({
    mode,
    presentation: values,
    projectActiveToTopLevel: options?.mirrorLegacy !== false,
  });
}
