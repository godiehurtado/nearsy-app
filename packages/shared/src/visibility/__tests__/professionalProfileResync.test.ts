/**
 * BUG-PROFILE-02 — Professional Discovery re-sync after face completion save.
 *
 * Run:
 * pnpm exec tsx --test --test-concurrency=1 packages/shared/src/visibility/__tests__/professionalProfileResync.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  shouldResyncProfessionalActiveModeAfterSave,
  setActiveProfileModeFlow,
} from '../activeProfileModeSync';
import { createFakeVisibilityDiscoveryClient } from '../callables';
import { buildOwnProfileSavePatch } from '../../profile/ownProfileEditorState';
import { buildActiveProfileSavePatch } from '../../profile/profileModeFields';
import { buildCrjDetailsPresentation } from '../../profile/crjProfileDetails';

const ROOT = join(__dirname, '..', '..');

function readShared(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('shouldResyncProfessionalActiveModeAfterSave', () => {
  it('Personal active mode → no re-sync', () => {
    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: 'personal',
        professionalFaceComplete: true,
      }),
      false,
    );
  });

  it('Professional + incomplete face → no re-sync', () => {
    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: 'professional',
        professionalFaceComplete: false,
      }),
      false,
    );
  });

  it('Professional + complete face → re-sync', () => {
    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: 'professional',
        professionalFaceComplete: true,
      }),
      true,
    );
  });

  it('null/undefined mode → no re-sync', () => {
    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: null,
        professionalFaceComplete: true,
      }),
      false,
    );
    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: undefined,
        professionalFaceComplete: true,
      }),
      false,
    );
  });
});

describe('Own Profile / CRJ patches exclude mode and visibility', () => {
  it('Own Profile professional save patch omits mode and visibility', () => {
    const patch = buildOwnProfileSavePatch({
      mode: 'professional',
      draft: {
        realName: 'Ada',
        lastName: 'Lovelace',
        profileImage: 'https://cdn.example/p.jpg',
        occupation: 'Engineer',
        bio: 'Builder',
        company: 'Analytical Engines',
      },
    });
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'mode'), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'visibility'),
      false,
    );
    assert.match(JSON.stringify(patch), /company/);
  });

  it('CRJ details professional patch omits mode and visibility', () => {
    const patch = buildActiveProfileSavePatch({
      mode: 'professional',
      presentation: buildCrjDetailsPresentation({
        mode: 'professional',
        occupation: 'Engineer',
        bio: 'Builder',
        company: 'Analytical Engines',
      }),
      projectActiveToTopLevel: true,
      includeModeInPatch: false,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'mode'), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'visibility'),
      false,
    );
  });
});

describe('setActiveProfileModeFlow is invoked once per complete Professional save path', () => {
  it('exactly one professional setActiveProfileMode call for a gated resync', async () => {
    const client = createFakeVisibilityDiscoveryClient({
      setActiveProfileMode: async (req) => ({
        contractVersion: 1,
        mode: req.mode,
        visibility: true,
        targetProfileComplete: true,
        discoverySynced: true,
        serverTime: 1_700_000_000_000,
      }),
    });

    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: 'professional',
        professionalFaceComplete: true,
      }),
      true,
    );

    const first = await setActiveProfileModeFlow(
      client,
      'professional',
      'uid-1',
    );
    assert.equal(first.ok, true);

    const calls = client.calls.filter((c) => c.name === 'setActiveProfileMode');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.request.mode, 'professional');
  });

  it('Personal gate prevents setActiveProfileMode (no duplicate / cyclic sync)', async () => {
    const client = createFakeVisibilityDiscoveryClient();
    assert.equal(
      shouldResyncProfessionalActiveModeAfterSave({
        activeMode: 'personal',
        professionalFaceComplete: true,
      }),
      false,
    );
    // Callers must respect the gate — Personal save must not invoke the flow.
    assert.equal(client.calls.length, 0);
  });
});

describe('BUG-PROFILE-02 screen wiring', () => {
  it('Own Profile persistOwnProfile resyncs Professional after Firestore save', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /shouldResyncProfessionalActiveModeAfterSave/);
    assert.match(src, /setActiveProfileModeFlow/);
    assert.match(src, /await updateUserProfilePartial\(uid, modePatch\);/);

    const saveIdx = src.indexOf('await updateUserProfilePartial(uid, modePatch);');
    const resyncIdx = src.indexOf(
      'shouldResyncProfessionalActiveModeAfterSave',
      saveIdx,
    );
    const flowIdx = src.indexOf("setActiveProfileModeFlow(", saveIdx);
    assert.ok(saveIdx >= 0);
    assert.ok(resyncIdx > saveIdx, 're-sync gate must follow Firestore save');
    assert.ok(flowIdx > resyncIdx, 'setActiveProfileModeFlow must follow gate');

    // Personal path: gate requires professional; no unconditional personal resync.
    assert.doesNotMatch(
      src,
      /setActiveProfileModeFlow\(\s*client,\s*'personal'/,
    );
  });

  it('CRJ persistDetails resyncs Professional after Firestore save', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    const detailsFn = src.slice(src.indexOf('async function persistDetails()'));
    const end = detailsFn.indexOf('async function persistInterests()');
    const body = detailsFn.slice(0, end > 0 ? end : undefined);

    assert.match(body, /updateUserProfilePartial/);
    assert.match(body, /shouldResyncProfessionalActiveModeAfterSave/);
    assert.match(body, /setActiveProfileModeFlow/);
    assert.match(body, /isCrjProfileDetailsValid/);
    assert.match(body, /includeModeInPatch:\s*false/);

    const saveIdx = body.indexOf('updateUserProfilePartial');
    const resyncIdx = body.indexOf('shouldResyncProfessionalActiveModeAfterSave');
    assert.ok(resyncIdx > saveIdx, 're-sync must follow details Firestore save');
  });

  it('Firestore save failure path does not precede re-sync (await order)', () => {
    const own = readShared('screens/CompleteProfileScreen.tsx');
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    // Re-sync is after awaited updateUserProfilePartial — failure throws before gate.
    assert.match(
      own,
      /await updateUserProfilePartial\(uid, modePatch\);[\s\S]*shouldResyncProfessionalActiveModeAfterSave/,
    );
    assert.match(
      crj,
      /await updateUserProfilePartial\(uid, \{[\s\S]*?profileSetupCompleted: false,[\s\S]*?\}\);[\s\S]*shouldResyncProfessionalActiveModeAfterSave/,
    );
  });
});
