/**
 * Single source of truth for the NEW dual-profile presentation model (CRJ).
 *
 * Per mode: realName, lastName, profileImage, occupation, status, bio
 * (+ company for professional).
 *
 * Top-level `realName` / `lastName` may be mirrored from the *active* face so
 * existing Home/Nearby readers keep working for new users — not a migration.
 *
 * Per-mode face contract (QA 2.1.0, agreed with Functions and Android):
 * - C1 Write: face fields go to the real nested map profiles.<mode>.<field>
 *   (splitFacePatch + upsertUserProfile), never blanks, never the other mode.
 * - C2 The same write deletes the legacy LITERAL top-level fields named
 *   "profiles.<mode>.<field>" for the fields it writes (that face only).
 * - C3 Read per field: literal → nested → top level only for the stored
 *   active mode. Literal first: after C2 it can only be newer (an older client
 *   wrote it), and before any 2.1.0 save it is the only per-mode data.
 * - C4 An absent value never authorizes writing or copying into the other
 *   mode; the inactive face never borrows top-level values.
 * The nested `profiles` map may be absent altogether.
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

/** Face fields that live per mode. */
export const FACE_FIELDS = [
  'realName',
  'lastName',
  'profileImage',
  'occupation',
  'status',
  'bio',
  'company',
] as const;
export type FaceField = (typeof FACE_FIELDS)[number];

/** Legacy literal top-level field name written by setDoc with dotted keys. */
export function literalFaceKey(mode: ProfileMode, field: string): string {
  return 'profiles.' + mode + '.' + field;
}

const FACE_PATCH_KEY = /^profiles\.(personal|professional)\.([A-Za-z]+)$/;

function faceFieldValue(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
  field: FaceField,
  pick: (value: unknown) => string | null,
): string | null {
  const profiles = (data?.profiles ?? {}) as ProfilesMap;
  const nested = (profiles[mode] ?? {}) as Record<string, unknown>;
  return (
    pick(data?.[literalFaceKey(mode, field)]) ??
    pick(nested[field]) ??
    (data?.mode === mode ? pick(data?.[field]) : null)
  );
}

/** Resolve presentation for one mode (contract C3/C4 above). */
export function resolveModePresentation(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): ModePresentation {
  const text = (field: FaceField) => faceFieldValue(data, mode, field, nonEmptyString) ?? '';
  return {
    realName: text('realName'),
    lastName: text('lastName'),
    profileImage: faceFieldValue(data, mode, 'profileImage', nonEmptyUri) ?? null,
    occupation: text('occupation'),
    status: text('status'),
    bio: text('bio'),
    company: text('company'),
  };
}

export type SplitFacePatch = {
  /** Everything that is not a per-mode face key, untouched. */
  rest: Record<string, unknown>;
  /** Face values as a nested map, per mode (only modes the patch writes). */
  faces: Partial<Record<ProfileMode, Record<string, unknown>>>;
  /** Legacy literal field names to delete in the same write (C2). */
  literalKeysToDelete: string[];
};

/**
 * C1/C2: turns "profiles.<mode>.<field>" patch keys into a nested map plus the
 * literal names to delete. Only keys present in the patch are touched; a blank
 * or absent field writes nothing and deletes nothing.
 */
export function splitFacePatch(patch: Record<string, unknown>): SplitFacePatch {
  const rest: Record<string, unknown> = {};
  const faces: SplitFacePatch['faces'] = {};
  const literalKeysToDelete: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const match = FACE_PATCH_KEY.exec(key);
    if (!match) {
      rest[key] = value;
      continue;
    }
    const mode = match[1] as ProfileMode;
    const face = faces[mode] ?? {};
    face[match[2]!] = value;
    faces[mode] = face;
    literalKeysToDelete.push(key);
  }
  return { rest, faces, literalKeysToDelete };
}

/**
 * The local copy of the user doc after a successful face save: nested values
 * updated, the written literals removed (as C2 does on the server), other keys
 * of the patch (top-level mirror, context) applied as written.
 */
export function applyFaceSaveToDoc(
  doc: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const { rest, faces, literalKeysToDelete } = splitFacePatch(patch);
  const out: Record<string, unknown> = { ...(doc ?? {}), ...rest };
  for (const key of literalKeysToDelete) delete out[key];
  const modes = Object.keys(faces) as ProfileMode[];
  if (modes.length > 0) {
    const profiles = { ...((out.profiles as Record<string, unknown> | undefined) ?? {}) };
    for (const mode of modes) {
      profiles[mode] = {
        ...((profiles[mode] as Record<string, unknown> | undefined) ?? {}),
        ...faces[mode],
      };
    }
    out.profiles = profiles;
  }
  return out;
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
  // Status is product-removed. Keep ModePresentation.status for legacy reads only.
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
