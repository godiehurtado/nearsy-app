import { isProfileDocumentComplete } from '../utils/profileDocumentComplete';
import {
  buildActiveProfileSavePatch,
  type ModePresentation,
  type ProfileMode,
} from './profileModeFields';

/** Own Profile is post-CRJ only. Incomplete documents must not use this editor. */
export function isOwnProfileEditorAllowed(profileDoc: unknown): boolean {
  return isProfileDocumentComplete(profileDoc);
}

/**
 * Lifecycle authorization for Own Profile load.
 * Distinguishes unresolved / loaded-complete / loaded-incomplete / load-error.
 * Never treats an unresolved document as incomplete.
 */
export type OwnProfileLifecycleAuth =
  | 'unresolved'
  | 'allowed'
  | 'incomplete'
  | 'error'
  | 'blocked';

export type OwnProfileLoadClassification =
  | { kind: 'unresolved' }
  | { kind: 'allow' }
  | { kind: 'redirect_incomplete' }
  | { kind: 'fail_closed'; reason: 'error' };

export function classifyOwnProfileLoadResult(input: {
  phase: 'unresolved' | 'success' | 'error';
  /** Present only when phase === 'success'. null means document missing. */
  doc?: unknown | null;
}): OwnProfileLoadClassification {
  if (input.phase === 'unresolved') return { kind: 'unresolved' };
  if (input.phase === 'error') {
    return { kind: 'fail_closed', reason: 'error' };
  }
  if (input.doc == null || !isOwnProfileEditorAllowed(input.doc)) {
    return { kind: 'redirect_incomplete' };
  }
  return { kind: 'allow' };
}

export function isOwnProfileSaveAuthorized(
  auth: OwnProfileLifecycleAuth,
): boolean {
  return auth === 'allowed';
}

/** Writable Own Profile only when lifecycle authorization resolved to allowed. */
export function isOwnProfileEditorWritable(
  auth: OwnProfileLifecycleAuth,
): boolean {
  return auth === 'allowed';
}

/**
 * Dirty leave decision. `bypass` is set synchronously after Discard so the
 * re-dispatched navigation action is not prompted again.
 */
export function decideDirtyNavigationGuard(input: {
  isDirty: boolean;
  bypass: boolean;
}): 'allow' | 'prompt' {
  if (input.bypass || !input.isDirty) return 'allow';
  return 'prompt';
}

export function isLocalProfileImageUri(value?: string | null): boolean {
  return !!value && /^(file|content|ph|assets-library):/i.test(value);
}

/**
 * After a successful upload, draft + snapshot must share the same remote URL
 * so dirty does not flip true from local-vs-remote mismatch.
 */
export function buildPersistedOwnProfileDraftAfterUpload(
  draft: OwnProfileDraft,
  uploadedRemoteUrl: string,
): OwnProfileDraft {
  if (isLocalProfileImageUri(uploadedRemoteUrl)) {
    throw new Error('Own Profile save requires a remote profile image URL.');
  }
  return createOwnProfileSnapshot({
    ...draft,
    profileImage: uploadedRemoteUrl,
  });
}

export function createOwnProfileDraftFromPresentation(
  presentation: ModePresentation,
): OwnProfileDraft {
  return createOwnProfileSnapshot({
    realName: presentation.realName ?? '',
    lastName: presentation.lastName ?? '',
    profileImage: presentation.profileImage ?? null,
    occupation: presentation.occupation ?? '',
    bio: presentation.bio ?? '',
    company: presentation.company ?? '',
  });
}

/** Editable Own Profile fields for the active face. Status and topBar are excluded. */
export type OwnProfileDraft = {
  realName: string;
  lastName: string;
  profileImage: string | null;
  occupation: string;
  bio: string;
  company: string;
};

export type OwnProfileValidationField =
  | 'realName'
  | 'lastName'
  | 'profileImage'
  | 'occupation'
  | 'bio'
  | 'company'
  | 'mode';

export type OwnProfileValidationResult =
  | { ok: true }
  | { ok: false; field: OwnProfileValidationField };

export function normalizeOwnProfileDraft(
  draft: OwnProfileDraft,
): OwnProfileDraft {
  const image = draft.profileImage?.trim() || null;
  return {
    realName: draft.realName.trim(),
    lastName: draft.lastName.trim(),
    profileImage: image,
    occupation: draft.occupation.trim(),
    bio: draft.bio.trim(),
    company: draft.company.trim(),
  };
}

export function createOwnProfileSnapshot(
  draft: OwnProfileDraft,
): OwnProfileDraft {
  return normalizeOwnProfileDraft(draft);
}

export function isOwnProfileDraftDirty(
  draft: OwnProfileDraft,
  snapshot: OwnProfileDraft | null,
  mode: ProfileMode | null,
): boolean {
  if (!snapshot || !mode) return false;
  const current = normalizeOwnProfileDraft(draft);
  if (current.realName !== snapshot.realName) return true;
  if (current.lastName !== snapshot.lastName) return true;
  if (current.profileImage !== snapshot.profileImage) return true;
  if (current.occupation !== snapshot.occupation) return true;
  if (current.bio !== snapshot.bio) return true;
  if (mode === 'professional' && current.company !== snapshot.company) {
    return true;
  }
  return false;
}

export function validateOwnProfileDraft(
  draft: OwnProfileDraft,
  mode: ProfileMode | null,
): OwnProfileValidationResult {
  if (!mode) return { ok: false, field: 'mode' };
  const current = normalizeOwnProfileDraft(draft);
  if (!current.realName) return { ok: false, field: 'realName' };
  if (!current.lastName) return { ok: false, field: 'lastName' };
  if (!current.profileImage) return { ok: false, field: 'profileImage' };
  if (!current.occupation) return { ok: false, field: 'occupation' };
  if (!current.bio) return { ok: false, field: 'bio' };
  if (mode === 'professional' && !current.company) {
    return { ok: false, field: 'company' };
  }
  return { ok: true };
}

/** Presentation for `buildActiveProfileSavePatch` — never includes status. */
export function buildOwnProfileSavePresentation(
  draft: OwnProfileDraft,
  mode: ProfileMode,
): {
  realName: string;
  lastName: string;
  profileImage: string | null;
  occupation: string;
  bio: string;
  company?: string;
} {
  const current = normalizeOwnProfileDraft(draft);
  return {
    realName: current.realName,
    lastName: current.lastName,
    profileImage: current.profileImage,
    occupation: current.occupation,
    bio: current.bio,
    ...(mode === 'professional' ? { company: current.company } : {}),
  };
}

export function buildOwnProfileSavePatch(input: {
  mode: ProfileMode;
  draft: OwnProfileDraft;
}): Record<string, unknown> {
  const presentation = buildOwnProfileSavePresentation(input.draft, input.mode);
  if (isLocalProfileImageUri(presentation.profileImage)) {
    throw new Error('Own Profile save refuses local profile image URIs.');
  }
  return buildActiveProfileSavePatch({
    mode: input.mode,
    presentation,
    projectActiveToTopLevel: true,
    includeModeInPatch: false,
  });
}

const FORBIDDEN_OWN_PROFILE_SAVE_KEYS = [
  'profileSetupCompleted',
  'mode',
  'visibility',
  'status',
  'topBarColor',
  'topBarImage',
  'topBarMode',
] as const;

export function ownProfileSaveOmitsForbiddenKeys(
  patch: Record<string, unknown>,
): boolean {
  for (const key of FORBIDDEN_OWN_PROFILE_SAVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'profiles.personal.status')) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'profiles.professional.status')
  ) {
    return false;
  }
  return true;
}

export { FORBIDDEN_OWN_PROFILE_SAVE_KEYS };
