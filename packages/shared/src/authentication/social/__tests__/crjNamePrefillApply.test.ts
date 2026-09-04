import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { resolveCrjNamePrefill } from '../application/resolveCrjNamePrefill';
import {
  clearPendingSocialProfilePrefill,
  commitPendingSocialNamePrefill,
  peekAppliedSocialNamePrefill,
  peekPendingSocialProfilePrefill,
  setPendingSocialProfilePrefill,
} from '../application/socialProfilePrefillStore';
import { mapSocialProfileToNamePrefill } from '../application/mapSocialNamePrefill';

const UID = 'uid-crj-name';

describe('resolveCrjNamePrefill (CRJ Name step)', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  it('applies Apple givenName/familyName when pending exists before Name step', () => {
    setPendingSocialProfilePrefill(UID, {
      provider: 'apple',
      givenName: 'Ada',
      familyName: 'Lovelace',
      displayName: 'Ada Lovelace',
    });
    const pending = peekPendingSocialProfilePrefill();
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending,
      retainedApplied: null,
    });
    assert.equal(result.nextFirstName, 'Ada');
    assert.equal(result.nextLastName, 'Lovelace');
    assert.equal(result.prefillAppliedToFirstName, true);
    assert.equal(result.prefillAppliedToLastName, true);
    assert.equal(result.shouldConsumePending, true);
    assert.equal(result.diag.pendingPresentAtNameStep, true);
    assert.equal(result.diag.pendingConsumedAfterApply, true);
  });

  it('applies pending written after mount (same as arriving before Name)', () => {
    // Simulate: ProfileCompletion mounted with empty pending, then Apple wrote it.
    assert.equal(peekPendingSocialProfilePrefill(), null);
    setPendingSocialProfilePrefill(UID, {
      provider: 'apple',
      givenName: 'Grace',
      familyName: 'Hopper',
    });
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: null,
    });
    assert.equal(result.nextFirstName, 'Grace');
    assert.equal(result.nextLastName, 'Hopper');
    assert.equal(result.shouldConsumePending, true);
  });

  it('maps LinkedIn displayName to Name only', () => {
    setPendingSocialProfilePrefill(UID, {
      provider: 'linkedin',
      displayName: 'Ada Lovelace',
    });
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: null,
    });
    assert.equal(result.nextFirstName, 'Ada Lovelace');
    assert.equal(result.nextLastName, '');
    assert.equal(result.prefillAppliedToFirstName, true);
    assert.equal(result.prefillAppliedToLastName, false);
  });

  it('does not overwrite user-edited fields', () => {
    setPendingSocialProfilePrefill(UID, {
      provider: 'apple',
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: 'User',
      lastName: '',
      firstNameEdited: true,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: null,
    });
    assert.equal(result.nextFirstName, 'User');
    assert.equal(result.nextLastName, 'Lovelace');
    assert.equal(result.prefillAppliedToFirstName, false);
    assert.equal(result.prefillAppliedToLastName, true);
  });

  it('ignores pending for another uid', () => {
    setPendingSocialProfilePrefill('other-uid', {
      provider: 'apple',
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: null,
    });
    assert.equal(result.nextFirstName, '');
    assert.equal(result.nextLastName, '');
    assert.equal(result.shouldConsumePending, false);
    assert.equal(result.diag.pendingPresentAtNameStep, false);
  });

  it('consumes pending only after apply and retains remount snapshot', () => {
    setPendingSocialProfilePrefill(UID, {
      provider: 'apple',
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
    const first = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: null,
    });
    assert.equal(first.shouldConsumePending, true);
    commitPendingSocialNamePrefill(first.retainedApplied!);
    assert.equal(peekPendingSocialProfilePrefill(), null);
    assert.deepEqual(peekAppliedSocialNamePrefill(), {
      uid: UID,
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    // Remount: pending gone, retained snapshot still applies to empty fields.
    const remount = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: peekAppliedSocialNamePrefill(),
    });
    assert.equal(remount.nextFirstName, 'Ada');
    assert.equal(remount.nextLastName, 'Lovelace');
    assert.equal(remount.shouldConsumePending, false);
  });

  it('does not re-apply over already filled non-edited fields (no duplicate)', () => {
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: 'Ada',
      lastName: 'Lovelace',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: {
        uid: UID,
        socialProfile: {
          provider: 'apple',
          givenName: 'Ada',
          familyName: 'Lovelace',
        },
      },
      retainedApplied: null,
    });
    assert.equal(result.prefillAppliedToFirstName, false);
    assert.equal(result.prefillAppliedToLastName, false);
    assert.equal(result.shouldConsumePending, true);
  });

  it('Profile Type → Name transition applies both Apple fields', () => {
    // Empty wizard state after type selection; pending already queued.
    setPendingSocialProfilePrefill(UID, {
      provider: 'apple',
      givenName: 'Katherine',
      familyName: 'Johnson',
    });
    const mapped = mapSocialProfileToNamePrefill(
      peekPendingSocialProfilePrefill()!.socialProfile,
    );
    assert.equal(mapped.firstName, 'Katherine');
    assert.equal(mapped.lastName, 'Johnson');
    const result = resolveCrjNamePrefill({
      uid: UID,
      firstName: '',
      lastName: '',
      firstNameEdited: false,
      lastNameEdited: false,
      pending: peekPendingSocialProfilePrefill(),
      retainedApplied: null,
    });
    assert.equal(result.nextFirstName, 'Katherine');
    assert.equal(result.nextLastName, 'Johnson');
  });
});
