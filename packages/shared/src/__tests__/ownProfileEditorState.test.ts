import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOwnProfileSavePatch,
  buildPersistedOwnProfileDraftAfterUpload,
  classifyOwnProfileLoadResult,
  createOwnProfileDraftFromPresentation,
  createOwnProfileSnapshot,
  decideDirtyNavigationGuard,
  isLocalProfileImageUri,
  isOwnProfileDraftDirty,
  isOwnProfileEditorAllowed,
  isOwnProfileEditorWritable,
  isOwnProfileSaveAuthorized,
  ownProfileSaveOmitsForbiddenKeys,
  validateOwnProfileDraft,
  type OwnProfileDraft,
} from '../profile/ownProfileEditorState';
import { buildActiveProfileSavePatch } from '../profile/profileModeFields';

const completeDraft: OwnProfileDraft = {
  realName: 'Ana',
  lastName: 'García',
  profileImage: 'https://cdn.example/ana.jpg',
  occupation: 'Engineer',
  bio: 'Hello nearby',
  company: 'Nearsy',
};

function patchKeys(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).sort();
}

describe('Own Profile load lifecycle classification', () => {
  it('unresolved does not redirect and is not writable/saveable', () => {
    assert.deepEqual(classifyOwnProfileLoadResult({ phase: 'unresolved' }), {
      kind: 'unresolved',
    });
    assert.equal(isOwnProfileEditorWritable('unresolved'), false);
    assert.equal(isOwnProfileSaveAuthorized('unresolved'), false);
  });

  it('loaded complete allows Own Profile', () => {
    assert.deepEqual(
      classifyOwnProfileLoadResult({
        phase: 'success',
        doc: { profileSetupCompleted: true },
      }),
      { kind: 'allow' },
    );
    assert.equal(isOwnProfileEditorWritable('allowed'), true);
    assert.equal(isOwnProfileSaveAuthorized('allowed'), true);
  });

  it('explicit incomplete redirects; missing doc is incomplete after success', () => {
    assert.deepEqual(
      classifyOwnProfileLoadResult({
        phase: 'success',
        doc: { profileSetupCompleted: false },
      }),
      { kind: 'redirect_incomplete' },
    );
    assert.deepEqual(
      classifyOwnProfileLoadResult({ phase: 'success', doc: null }),
      { kind: 'redirect_incomplete' },
    );
    assert.equal(isOwnProfileEditorWritable('incomplete'), false);
    assert.equal(isOwnProfileSaveAuthorized('incomplete'), false);
    assert.equal(isOwnProfileEditorWritable('blocked'), false);
  });

  it('load error fails closed and does not impersonate incomplete', () => {
    assert.deepEqual(classifyOwnProfileLoadResult({ phase: 'error' }), {
      kind: 'fail_closed',
      reason: 'error',
    });
    assert.equal(isOwnProfileSaveAuthorized('error'), false);
    assert.equal(isOwnProfileEditorWritable('error'), false);
  });

  it('isOwnProfileEditorAllowed stays strict profileSetupCompleted === true', () => {
    assert.equal(isOwnProfileEditorAllowed(null), false);
    assert.equal(isOwnProfileEditorAllowed({ realName: 'Ana' }), false);
    assert.equal(
      isOwnProfileEditorAllowed({ profileSetupCompleted: true }),
      true,
    );
  });
});

describe('Dirty navigation guard', () => {
  it('Continue Editing path keeps prompt when dirty and no bypass', () => {
    assert.equal(
      decideDirtyNavigationGuard({ isDirty: true, bypass: false }),
      'prompt',
    );
  });

  it('Discard path allows the original action exactly once via bypass', () => {
    assert.equal(
      decideDirtyNavigationGuard({ isDirty: true, bypass: true }),
      'allow',
    );
  });

  it('clean navigation proceeds without prompt', () => {
    assert.equal(
      decideDirtyNavigationGuard({ isDirty: false, bypass: false }),
      'allow',
    );
  });
});

describe('Own Profile lifecycle safety', () => {
  it('personal save omits lifecycle, mode, visibility, status, and topBar', () => {
    const patch = buildOwnProfileSavePatch({
      mode: 'personal',
      draft: completeDraft,
    });
    assert.equal(ownProfileSaveOmitsForbiddenKeys(patch), true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'profileSetupCompleted'),
      false,
    );
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'mode'), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'visibility'),
      false,
    );
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'status'), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'topBarColor'),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'topBarImage'),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'topBarMode'),
      false,
    );
  });

  it('buildActiveProfileSavePatch ignores presentation.status for new writes', () => {
    const patch = buildActiveProfileSavePatch({
      mode: 'personal',
      presentation: {
        realName: 'Ana',
        lastName: 'García',
        occupation: 'Engineer',
        bio: 'Hello',
        status: 'should not persist',
      },
      includeModeInPatch: false,
    });
    assert.equal(patch.status, undefined);
    assert.equal(patch['profiles.personal.status'], undefined);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'profiles.personal.status'),
      false,
    );
  });
});

describe('Own Profile mode isolation', () => {
  it('Personal patch writes only approved personal keys', () => {
    const patch = buildOwnProfileSavePatch({
      mode: 'personal',
      draft: completeDraft,
    });
    assert.deepEqual(patchKeys(patch), [
      'bio',
      'lastName',
      'occupation',
      'profileImage',
      'profiles.personal.bio',
      'profiles.personal.lastName',
      'profiles.personal.occupation',
      'profiles.personal.profileImage',
      'profiles.personal.realName',
      'realName',
    ]);
    for (const key of Object.keys(patch)) {
      assert.equal(key.startsWith('profiles.professional.'), false, key);
    }
    assert.equal(patch.company, undefined);
  });

  it('Professional patch writes only approved professional keys including company', () => {
    const patch = buildOwnProfileSavePatch({
      mode: 'professional',
      draft: completeDraft,
    });
    assert.deepEqual(patchKeys(patch), [
      'bio',
      'company',
      'lastName',
      'occupation',
      'profileImage',
      'profiles.professional.bio',
      'profiles.professional.company',
      'profiles.professional.lastName',
      'profiles.professional.occupation',
      'profiles.professional.profileImage',
      'profiles.professional.realName',
      'realName',
    ]);
    for (const key of Object.keys(patch)) {
      assert.equal(key.startsWith('profiles.personal.'), false, key);
    }
  });
});

describe('Own Profile last name', () => {
  it('loads lastName per face from presentation', () => {
    const personal = createOwnProfileDraftFromPresentation({
      realName: 'Ana',
      lastName: 'García',
      occupation: 'Engineer',
      bio: 'P',
      company: '',
    });
    const professional = createOwnProfileDraftFromPresentation({
      realName: 'Ana',
      lastName: 'Martínez',
      occupation: 'CEO',
      bio: 'Pro',
      company: 'Nearsy',
    });
    assert.equal(personal.lastName, 'García');
    assert.equal(professional.lastName, 'Martínez');
    assert.notEqual(personal.lastName, professional.lastName);
  });

  it('normalizes lastName and includes it in active nested + top-level patch', () => {
    const patch = buildOwnProfileSavePatch({
      mode: 'personal',
      draft: { ...completeDraft, lastName: '  García  ' },
    });
    assert.equal(patch.lastName, 'García');
    assert.equal(patch['profiles.personal.lastName'], 'García');
  });

  it('requires lastName for both modes', () => {
    assert.deepEqual(
      validateOwnProfileDraft({ ...completeDraft, lastName: '   ' }, 'personal'),
      { ok: false, field: 'lastName' },
    );
    assert.deepEqual(
      validateOwnProfileDraft(
        { ...completeDraft, lastName: '' },
        'professional',
      ),
      { ok: false, field: 'lastName' },
    );
  });
});

describe('Own Profile validation', () => {
  it('requires identity, image, occupation, and bio on both faces', () => {
    assert.equal(validateOwnProfileDraft(completeDraft, 'personal').ok, true);
    assert.deepEqual(
      validateOwnProfileDraft({ ...completeDraft, realName: '' }, 'personal'),
      { ok: false, field: 'realName' },
    );
    assert.deepEqual(
      validateOwnProfileDraft(
        { ...completeDraft, profileImage: null },
        'personal',
      ),
      { ok: false, field: 'profileImage' },
    );
    assert.deepEqual(
      validateOwnProfileDraft({ ...completeDraft, occupation: ' ' }, 'personal'),
      { ok: false, field: 'occupation' },
    );
    assert.deepEqual(
      validateOwnProfileDraft({ ...completeDraft, bio: '' }, 'personal'),
      { ok: false, field: 'bio' },
    );
  });

  it('requires company only for Professional', () => {
    assert.equal(
      validateOwnProfileDraft({ ...completeDraft, company: '' }, 'personal').ok,
      true,
    );
    assert.deepEqual(
      validateOwnProfileDraft({ ...completeDraft, company: '' }, 'professional'),
      { ok: false, field: 'company' },
    );
  });
});

describe('Own Profile dirty state', () => {
  it('unchanged draft is clean', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    assert.equal(
      isOwnProfileDraftDirty(completeDraft, snapshot, 'personal'),
      false,
    );
  });

  it('whitespace-only differences are clean after normalization', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    const padded: OwnProfileDraft = {
      realName: '  Ana  ',
      lastName: ' García ',
      profileImage: '  https://cdn.example/ana.jpg  ',
      occupation: ' Engineer',
      bio: 'Hello nearby ',
      company: ' Nearsy ',
    };
    assert.equal(isOwnProfileDraftDirty(padded, snapshot, 'personal'), false);
  });

  it('changing each approved field marks dirty', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    assert.equal(
      isOwnProfileDraftDirty(
        { ...completeDraft, realName: 'Ana Maria' },
        snapshot,
        'personal',
      ),
      true,
    );
    assert.equal(
      isOwnProfileDraftDirty(
        { ...completeDraft, company: 'Other Co' },
        snapshot,
        'personal',
      ),
      false,
    );
    assert.equal(
      isOwnProfileDraftDirty(
        { ...completeDraft, company: 'Other Co' },
        snapshot,
        'professional',
      ),
      true,
    );
  });

  it('Status and topBar are not part of the draft contract', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    assert.deepEqual(patchKeys(snapshot as unknown as Record<string, unknown>), [
      'bio',
      'company',
      'lastName',
      'occupation',
      'profileImage',
      'realName',
    ]);
  });

  it('successful-save snapshot becomes clean; discard restores snapshot', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    const dirty: OwnProfileDraft = { ...completeDraft, bio: 'Changed' };
    assert.equal(isOwnProfileDraftDirty(dirty, snapshot, 'personal'), true);
    const saved = createOwnProfileSnapshot(dirty);
    assert.equal(isOwnProfileDraftDirty(dirty, saved, 'personal'), false);
    assert.equal(isOwnProfileDraftDirty(snapshot, snapshot, 'personal'), false);
  });
});

describe('Own Profile image persistence', () => {
  it('unchanged remote photo is clean; new local photo is dirty', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    assert.equal(
      isOwnProfileDraftDirty(completeDraft, snapshot, 'personal'),
      false,
    );
    const localDraft: OwnProfileDraft = {
      ...completeDraft,
      profileImage: 'file:///tmp/new-photo.jpg',
    };
    assert.equal(isLocalProfileImageUri(localDraft.profileImage), true);
    assert.equal(isOwnProfileDraftDirty(localDraft, snapshot, 'personal'), true);
  });

  it('successful upload produces remote draft + remote snapshot + clean', () => {
    const localDraft: OwnProfileDraft = {
      ...completeDraft,
      profileImage: 'file:///tmp/new-photo.jpg',
    };
    const remote = 'https://cdn.example/uploaded.jpg';
    const persisted = buildPersistedOwnProfileDraftAfterUpload(
      localDraft,
      remote,
    );
    assert.equal(persisted.profileImage, remote);
    assert.equal(isLocalProfileImageUri(persisted.profileImage), false);
    assert.equal(isOwnProfileDraftDirty(persisted, persisted, 'personal'), false);
    const patch = buildOwnProfileSavePatch({
      mode: 'personal',
      draft: persisted,
    });
    assert.equal(patch.profileImage, remote);
    assert.equal(patch['profiles.personal.profileImage'], remote);
  });

  it('upload failure preserves local draft + dirty against prior snapshot', () => {
    const snapshot = createOwnProfileSnapshot(completeDraft);
    const localDraft: OwnProfileDraft = {
      ...completeDraft,
      profileImage: 'file:///tmp/new-photo.jpg',
    };
    // Simulate failure: no persisted draft applied.
    assert.equal(isOwnProfileDraftDirty(localDraft, snapshot, 'personal'), true);
    assert.equal(localDraft.profileImage, 'file:///tmp/new-photo.jpg');
  });

  it('refuses to persist a local URI as the public profile image', () => {
    assert.throws(() =>
      buildPersistedOwnProfileDraftAfterUpload(
        completeDraft,
        'file:///tmp/bad.jpg',
      ),
    );
    assert.throws(() =>
      buildOwnProfileSavePatch({
        mode: 'personal',
        draft: {
          ...completeDraft,
          profileImage: 'file:///tmp/bad.jpg',
        },
      }),
    );
  });
});
