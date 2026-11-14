/**
 * Single source of truth for the NEW dual-profile presentation model (CRJ).
 *
 * Per mode: realName, lastName, profileImage, occupation, status, bio
 * (+ company for professional).
 *
 * Top-level `realName` / `lastName` may be mirrored from the *active* face so
 * existing Home/Nearby readers keep working for new users — not a migration.
 *
 * QA 2.1.0 blocker 1 (contract C1–C7, agreed with iOS and Functions): faces are
 * written as a real nested map with set(merge); literal "profiles.<mode>.<field>"
 * fields from older builds are read first and removed field by field on save;
 * the inactive face never reads or writes top level. No migration.
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

/** Face fields stored per mode. `status` is product-removed and read only for old docs. */
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

/**
 * Literal top-level field name that older builds wrote by mistake: a dotted key
 * sent through set(merge) is stored as ONE field named "profiles.<mode>.<field>",
 * not as a nested path (QA 2.1.0 blocker 1, contract C1–C7 with iOS/Functions).
 */
export function literalFaceKey(mode: ProfileMode, field: FaceField): string {
  return `profiles.${mode}.${field}`;
}

function nestedFace(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): Record<string, unknown> {
  const profiles = data?.profiles;
  if (!profiles || typeof profiles !== 'object') return {};
  const face = (profiles as Record<string, unknown>)[mode];
  return face && typeof face === 'object' ? (face as Record<string, unknown>) : {};
}

/**
 * C3 read precedence for one face field:
 *   1. the literal "profiles.<mode>.<field>" field (newest when present: public
 *      builds keep writing it, and new saves delete it for what they write);
 *   2. nested profiles.<mode>.<field>;
 *   3. top level, ONLY when <mode> is the stored active mode.
 * Absent or blank values fall through; the inactive face never borrows top level.
 */
export function readFaceField(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
  field: FaceField,
): string | null {
  const pick = field === 'profileImage' ? nonEmptyUri : nonEmptyString;
  const literal = pick(data?.[literalFaceKey(mode, field)]);
  if (literal) return literal;
  const nested = pick(nestedFace(data, mode)[field]);
  if (nested) return nested;
  return data?.mode === mode ? pick(data?.[field]) : null;
}

/** Presentation for one mode, by the C3 precedence (see readFaceField). */
export function resolveModePresentation(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): ModePresentation {
  return {
    realName: readFaceField(data, mode, 'realName') ?? '',
    lastName: readFaceField(data, mode, 'lastName') ?? '',
    profileImage: readFaceField(data, mode, 'profileImage'),
    occupation: readFaceField(data, mode, 'occupation') ?? '',
    status: readFaceField(data, mode, 'status') ?? '',
    bio: readFaceField(data, mode, 'bio') ?? '',
    company: readFaceField(data, mode, 'company') ?? '',
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
  /**
   * Also mirror the face to top level for current readers. Only for the
   * CONFIRMED active face (C1); an inactive face never touches top level.
   */
  projectActiveToTopLevel?: boolean;
  /**
   * When false, omits top-level `mode` from the patch (mode changes use setActiveProfileMode).
   * Default true for Android / legacy callers.
   */
  includeModeInPatch?: boolean;
  /**
   * The platform's FieldValue.delete() sentinel. Each written field also deletes
   * its literal "profiles.<mode>.<field>" twin (C2), so a stale literal can no
   * longer win the read precedence.
   */
  literalDelete: unknown;
};

/**
 * set(merge) payload for ONE face (C1/C2):
 * - writes a real nested map `profiles: { <mode>: { ...fields } }`;
 * - deletes the literal "profiles.<mode>.<field>" for exactly the fields written;
 * - never writes blanks or undefined, never the other mode, never visibility or
 *   profileSetupCompleted; top-level mirror only when asked (confirmed active face).
 * Must be written with set(..., { merge: true }): merge keeps the other face and
 * this face's other fields.
 */
export function buildActiveProfileSavePatch(
  input: ActiveProfileSaveInput,
): Record<string, unknown> {
  const { mode, presentation } = input;
  const project = input.projectActiveToTopLevel === true;
  const includeMode = input.includeModeInPatch !== false;
  const out: Record<string, unknown> = includeMode ? { mode } : {};

  const nestedEntries: [FaceField, unknown][] = [];

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

  if (nestedEntries.length === 0) return out;

  const face: Record<string, unknown> = {};
  for (const [key, value] of nestedEntries) {
    face[key] = value;
    out[literalFaceKey(mode, key)] = input.literalDelete;
    if (project) out[key] = value;
  }
  out.profiles = { [mode]: face };
  return out;
}

/**
 * The local document after a successful face save, from the patch that was
 * written: nested face merged field by field (the other face kept), literal
 * twins removed, other keys applied as written. Never spread a face patch into
 * local state: `profiles` would replace the other face.
 */
export function applyProfileSavePatchToDoc(
  doc: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(doc ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'profiles') {
      const current =
        out.profiles && typeof out.profiles === 'object'
          ? (out.profiles as Record<string, unknown>)
          : {};
      const merged: Record<string, unknown> = { ...current };
      for (const [mode, face] of Object.entries((value ?? {}) as Record<string, unknown>)) {
        const prev =
          merged[mode] && typeof merged[mode] === 'object' ? (merged[mode] as object) : {};
        merged[mode] = { ...prev, ...((face ?? {}) as object) };
      }
      out.profiles = merged;
    } else if (key.startsWith('profiles.')) {
      delete out[key];
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** @deprecated Prefer buildActiveProfileSavePatch — kept for call-site migration. */
export function buildModePresentationPatch(
  mode: ProfileMode,
  values: ModePresentation,
  options: { mirrorLegacy?: boolean; literalDelete: unknown },
): Record<string, unknown> {
  return buildActiveProfileSavePatch({
    mode,
    presentation: values,
    projectActiveToTopLevel: options.mirrorLegacy !== false,
    literalDelete: options.literalDelete,
  });
}
