/**
 * I2-G LinkedIn → CRJ pending social prefill (Auth displayName/photoURL).
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { mapSocialProfileToNamePrefill } from '../../social/application/mapSocialNamePrefill';
import {
  clearPendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
} from '../../social/application/socialProfilePrefillStore';
import {
  buildLinkedInSocialProfileFromAuthHints,
  linkedInHttpsPhotoHint,
  queueLinkedInCrjPrefillIfNeeded,
} from '../profilePrefill';

const UID = 'uid-linkedin-prefill';

describe('LinkedIn CRJ pending prefill', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  it('queues displayName pending prefill before any navigation for incomplete profiles', () => {
    const result = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: false,
      displayName: '  LinkedIn Display  ',
      photoURL: null,
    });
    assert.equal(result.queued, true);
    assert.equal(result.hasDisplayName, true);
    assert.equal(result.hasPhotoUrl, false);

    const pending = peekPendingSocialProfilePrefill();
    assert.equal(pending?.uid, UID);
    assert.equal(pending?.socialProfile.provider, 'linkedin');
    assert.equal(pending?.socialProfile.displayName, 'LinkedIn Display');
    assert.equal(pending?.socialProfile.givenName, undefined);
    assert.equal(pending?.socialProfile.familyName, undefined);
    assert.equal('idToken' in (pending?.socialProfile ?? {}), false);
  });

  it('continues without pending prefill when displayName is absent', () => {
    const result = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: false,
      displayName: '   ',
      photoURL: null,
    });
    assert.equal(result.queued, false);
    assert.equal(result.hasDisplayName, false);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('does not queue pending prefill for complete profiles (MainTabs)', () => {
    const result = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: true,
      displayName: 'LinkedIn Display',
      photoURL: 'https://media.licdn.com/dms/image/example.png',
    });
    assert.equal(result.queued, false);
    assert.equal(result.hasDisplayName, true);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('does not fill Last Name from displayName', () => {
    const social = buildLinkedInSocialProfileFromAuthHints({
      displayName: 'Ada Lovelace',
      photoURL: null,
    });
    assert.ok(social);
    const names = mapSocialProfileToNamePrefill(social);
    assert.equal(names.firstName, 'Ada Lovelace');
    assert.equal(names.lastName, '');
  });

  it('accepts HTTPS photoUrl only', () => {
    assert.equal(
      linkedInHttpsPhotoHint('https://media.licdn.com/dms/image/p.png'),
      'https://media.licdn.com/dms/image/p.png',
    );
    assert.equal(linkedInHttpsPhotoHint('http://insecure.example/p.png'), undefined);
    assert.equal(linkedInHttpsPhotoHint('javascript:alert(1)'), undefined);

    const queued = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: false,
      displayName: 'Ada',
      photoURL: 'http://insecure.example/p.png',
    });
    assert.equal(queued.queued, true);
    assert.equal(queued.hasPhotoUrl, false);
    assert.equal(peekPendingSocialProfilePrefill()?.socialProfile.photoUrl, undefined);
  });

  it('does not write identity or profileSetupCompleted (store-only)', () => {
    const result = queueLinkedInCrjPrefillIfNeeded({
      uid: UID,
      profileComplete: false,
      displayName: 'Ada',
      photoURL: 'https://media.licdn.com/dms/image/p.png',
    });
    assert.equal(result.queued, true);
    const pending = peekPendingSocialProfilePrefill();
    assert.ok(pending);
    assert.equal(
      'realName' in pending.socialProfile ||
        'lastName' in pending.socialProfile ||
        'profileSetupCompleted' in pending.socialProfile,
      false,
    );
  });
});
