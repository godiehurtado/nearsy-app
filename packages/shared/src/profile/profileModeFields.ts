/**
 * Single source of truth for the NEW dual-profile presentation model (CRJ).
 *
 * Per mode: realName, lastName, profileImage, occupation, status, bio
 * (+ company for professional).
 *
 * Top-level `realName` / `lastName` may be mirrored from the *active* face so
 * existing Home/Nearby readers keep working for new users — not a migration.
 */

export type ProfileMode = 'personal' | 'professional';

export type ModePresentation = {
  realName?: string;
  lastName?: string;
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
  const activeFallback = data?.mode === mode;

  return {
    realName:
      nonEmptyString(nested.realName) ??
      (activeFallback ? nonEmptyString(data?.realName) : null) ??
      '',
    lastName:
      nonEmptyString(nested.lastName) ??
      (activeFallback ? nonEmptyString(data?.lastName) : null) ??
      '',
    profileImage:
      nonEmptyUri(nested.profileImage) ??
      (activeFallback ? nonEmptyUri(data?.profileImage) : null) ??
      null,
    occupation:
      nonEmptyString(nested.occupation) ??
      (activeFallback ? nonEmptyString(data?.occupation) : null) ??
      '',
    status:
      nonEmptyString(nested.status) ??
      (activeFallback ? nonEmptyString(data?.status) : null) ??
      '',
    bio:
      nonEmptyString(nested.bio) ??
      (activeFallback ? nonEmptyString(data?.bio) : null) ??
      '',
    company:
      nonEmptyString(nested.company) ??
      (activeFallback ? nonEmptyString(data?.company) : null) ??
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
  /** @deprecated Prefer presentation.realName — still accepted for callers. */
  realName?: string;
  presentation: ModePresentation;
  /** When true (default), also project active face to top-level for current readers. */
  projectActiveToTopLevel?: boolean;
  /**
   * When false, omits top-level `mode` from the patch (mode changes use setActiveProfileMode).
   * Default true for Android / legacy callers.
   */
  includeModeInPatch?: boolean;
};

/**
 * Build Firestore merge patch for ONE mode only.
 * - Never writes the other mode's nested keys.
 * - Never writes undefined or blank strings.
 * - Does not set visibility or profileSetupCompleted (callers decide).
 */
export function buildActiveProfileSavePatch(
  input: ActiveProfileSaveInput,
): Record<string, unknown> {
  const { mode, presentation } = input;
  const project = input.projectActiveToTopLevel !== false;
  const includeMode = input.includeModeInPatch !== false;
  const flat: Record<string, unknown> = includeMode ? { mode } : {};

  const nestedEntries: [string, unknown][] = [];

  const realName =
    nonEmptyString(presentation.realName) ?? nonEmptyString(input.realName);
  if (realName) nestedEntries.push(['realName', realName]);

  const lastName = nonEmptyString(presentation.lastName);
  if (lastName) nestedEntries.push(['lastName', lastName]);

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
