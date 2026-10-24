import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateOwnProfileModeActivation,
  isOwnProfileModeActivationRejected,
  shouldApplyOwnProfileModeSwitch,
} from '../profile/ownProfileModeActivation.ts';
import type { OwnProfileDraft } from '../profile/ownProfileEditorState.ts';
import { normalizeVisibilityCallableError } from '../visibility/callables/errors.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const completePersonal: OwnProfileDraft = {
  realName: 'Ada',
  lastName: 'Lovelace',
  profileImage: 'https://example.com/a.jpg',
  occupation: 'Engineer',
  bio: 'Notes',
  company: '',
};

describe('NEARSY-209 incomplete profile mode switch', () => {
  it('blocks Professional activation without company and keeps Personal complete', () => {
    const blocked = evaluateOwnProfileModeActivation({
      targetMode: 'professional',
      targetDraft: completePersonal,
    });
    assert.deepEqual(blocked, { ok: false, field: 'company' });
    const personalOk = evaluateOwnProfileModeActivation({
      targetMode: 'personal',
      targetDraft: completePersonal,
    });
    assert.equal(personalOk.ok, true);
  });

  it('does not apply a switch the backend did not confirm as complete', () => {
    assert.equal(
      shouldApplyOwnProfileModeSwitch({
        requestedMode: 'professional',
        responseMode: 'professional',
        targetProfileComplete: false,
      }),
      false,
    );
    assert.equal(
      shouldApplyOwnProfileModeSwitch({
        requestedMode: 'professional',
        responseMode: 'personal',
        targetProfileComplete: true,
      }),
      false,
    );
    assert.equal(
      shouldApplyOwnProfileModeSwitch({
        requestedMode: 'professional',
        responseMode: 'professional',
        targetProfileComplete: true,
      }),
      true,
    );
  });

  it('treats profile-incomplete callable errors as activation rejection', () => {
    assert.equal(
      isOwnProfileModeActivationRejected({
        code: 'failed-precondition',
        reason: { kind: 'known', value: 'profile-incomplete' },
      }),
      true,
    );
    assert.equal(
      isOwnProfileModeActivationRejected({
        code: 'unavailable',
        reason: { kind: 'none' },
      }),
      false,
    );
    const fromDetailsCode = normalizeVisibilityCallableError({
      code: 'functions/failed-precondition',
      details: {
        reason: 'profile-incomplete',
        retryable: false,
        code: 'PROFILE_INCOMPLETE',
        mode: 'professional',
        missingFields: ['company', 'bio'],
      },
    });
    assert.equal(isOwnProfileModeActivationRejected(fromDetailsCode), true);
    assert.equal(fromDetailsCode.retryable, false);
    assert.equal(fromDetailsCode.detailsCode, 'PROFILE_INCOMPLETE');
    assert.equal(fromDetailsCode.destinationMode, 'professional');
    assert.deepEqual(fromDetailsCode.missingFields, ['company', 'bio']);
    assert.equal(
      isOwnProfileModeActivationRejected({
        code: 'failed-precondition',
        reason: { kind: 'known', value: 'invalid-request' },
      }),
      false,
    );
  });

  it('Own Profile edits the destination face without writing mode on save', () => {
    const screen = readFileSync(
      path.join(root, 'screens/CompleteProfileScreen.tsx'),
      'utf8',
    );
    assert.match(screen, /setEditorMode/);
    assert.match(screen, /evaluateOwnProfileModeActivation/);
    assert.match(screen, /shouldApplyOwnProfileModeSwitch/);
    assert.match(screen, /buildOwnProfileSavePatch\(\{\s*mode: faceMode/);
    assert.match(screen, /destinationMode/);
    assert.match(screen, /missingFields/);
    const editor = readFileSync(
      path.join(root, 'profile/ownProfileEditorState.ts'),
      'utf8',
    );
    assert.match(editor, /includeModeInPatch: false/);
  });
});
