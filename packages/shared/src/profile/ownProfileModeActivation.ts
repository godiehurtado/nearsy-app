/**
 * Own Profile Personal/Professional activation.
 * Editing a face is allowed before it is active. Activation requires a complete
 * target face, including company for Professional, and never applies a mode the
 * callable did not confirm.
 */

import {
  createOwnProfileDraftFromPresentation,
  validateOwnProfileDraft,
  type OwnProfileDraft,
  type OwnProfileValidationResult,
} from './ownProfileEditorState.ts';
import {
  resolveModePresentation,
  type ProfileMode,
} from './profileModeFields.ts';

export function oppositeOwnProfileMode(mode: ProfileMode): ProfileMode {
  return mode === 'professional' ? 'personal' : 'professional';
}

export function draftForOwnProfileFace(
  doc: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): OwnProfileDraft {
  return createOwnProfileDraftFromPresentation(
    resolveModePresentation(doc, mode),
  );
}

export function evaluateOwnProfileModeActivation(input: {
  targetMode: ProfileMode;
  targetDraft: OwnProfileDraft;
}): OwnProfileValidationResult {
  return validateOwnProfileDraft(input.targetDraft, input.targetMode);
}

export function isOwnProfileModeActivationRejected(error: {
  code: string;
  reason: { kind: string; value?: string };
  detailsCode?: string;
}): boolean {
  if (error.reason.kind === 'known' && error.reason.value === 'profile-incomplete') {
    return true;
  }
  return error.detailsCode === 'PROFILE_INCOMPLETE';
}

export function shouldApplyOwnProfileModeSwitch(input: {
  requestedMode: ProfileMode;
  responseMode: ProfileMode;
  targetProfileComplete: boolean;
}): boolean {
  return (
    input.responseMode === input.requestedMode &&
    input.targetProfileComplete === true
  );
}
