/**
 * Unit tests for Google Profile Prefill (TS-008 Android).
 *
 * Run: node --experimental-strip-types --test packages/shared/src/authentication/__tests__/googleProfilePrefill.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  buildGoogleProfilePrefill,
  clearPendingGoogleProfilePrefill,
  consumePendingGoogleProfilePrefill,
  isEmptyPrefillValue,
  mapGoogleNameToRealName,
  mergeCompleteProfilePrefill,
  resolveProfileEmail,
  sanitizeGooglePhotoUrl,
  setPendingGoogleProfilePrefill,
} from '../googleProfilePrefillStore.ts';
import {
  createAuthenticateWithGoogle,
  GoogleAuthenticationError,
} from '../authenticateWithGoogle.ts';

describe('mapGoogleNameToRealName', () => {
  it('uses displayName when present and does not rebuild from given/family', () => {
    assert.equal(
      mapGoogleNameToRealName({
        displayName: 'Ada Lovelace',
        givenName: 'Ignored',
        familyName: 'Ignored',
      }),
      'Ada Lovelace',
    );
  });

  it('falls back to givenName + familyName when displayName is missing', () => {
    assert.equal(
      mapGoogleNameToRealName({
        givenName: 'Diego',
        familyName: 'Hurtado',
      }),
      'Diego Hurtado',
    );
    assert.equal(
      mapGoogleNameToRealName({
        givenName: 'Diego',
        displayName: '   ',
      }),
      'Diego',
    );
  });

  it('returns undefined when Google delivers no name data', () => {
    assert.equal(mapGoogleNameToRealName({}), undefined);
    assert.equal(
      mapGoogleNameToRealName({
        displayName: '  ',
        givenName: '',
        familyName: null as unknown as string,
      }),
      undefined,
    );
  });

  it('does not use email as a name fallback', () => {
    assert.equal(
      mapGoogleNameToRealName({
        displayName: undefined,
        givenName: undefined,
        familyName: undefined,
      }),
      undefined,
    );
  });
});

describe('sanitizeGooglePhotoUrl', () => {
  it('accepts https URLs', () => {
    assert.equal(
      sanitizeGooglePhotoUrl(' https://lh3.googleusercontent.com/a/photo '),
      'https://lh3.googleusercontent.com/a/photo',
    );
  });

  it('rejects non-https URLs', () => {
    assert.equal(sanitizeGooglePhotoUrl('http://example.com/a.png'), undefined);
    assert.equal(sanitizeGooglePhotoUrl('file:///tmp/a.png'), undefined);
    assert.equal(sanitizeGooglePhotoUrl('not-a-url'), undefined);
    assert.equal(sanitizeGooglePhotoUrl(''), undefined);
  });
});

describe('resolveProfileEmail', () => {
  it('prefers Firestore email over Firebase Auth and Google', () => {
    assert.equal(
      resolveProfileEmail({
        firestoreEmail: 'fs@nearsy.app',
        localEmail: null,
        firebaseAuthEmail: 'auth@nearsy.app',
        googleEmail: 'google@nearsy.app',
      }),
      'fs@nearsy.app',
    );
  });

  it('prefers Firebase Auth email when Firestore is empty', () => {
    assert.equal(
      resolveProfileEmail({
        firestoreEmail: '  ',
        localEmail: null,
        firebaseAuthEmail: 'auth@nearsy.app',
        googleEmail: 'google@nearsy.app',
      }),
      'auth@nearsy.app',
    );
  });

  it('uses Google email as fallback', () => {
    assert.equal(
      resolveProfileEmail({
        firestoreEmail: null,
        localEmail: null,
        firebaseAuthEmail: null,
        googleEmail: 'google@nearsy.app',
      }),
      'google@nearsy.app',
    );
  });

  it('prefers local email over Firebase Auth and Google', () => {
    assert.equal(
      resolveProfileEmail({
        firestoreEmail: null,
        localEmail: 'local@nearsy.app',
        firebaseAuthEmail: 'auth@nearsy.app',
        googleEmail: 'google@nearsy.app',
      }),
      'local@nearsy.app',
    );
  });
});

describe('mergeCompleteProfilePrefill', () => {
  it('treats whitespace as empty', () => {
    assert.equal(isEmptyPrefillValue('   '), true);
    assert.equal(isEmptyPrefillValue('0'), false);
  });

  it('keeps existing Firestore realName over Google', () => {
    const merged = mergeCompleteProfilePrefill(
      {
        realName: 'Diego Hurtado',
        profileImage: null,
        email: null,
      },
      {
        displayName: 'Should Not Win',
        givenName: 'Ada',
        familyName: 'Lovelace',
        photoUrl: 'https://lh3.googleusercontent.com/a/photo',
      },
    );
    assert.equal(merged.realName, 'Diego Hurtado');
    assert.equal(
      merged.profileImage,
      'https://lh3.googleusercontent.com/a/photo',
    );
  });

  it('keeps local/seed realName over Google', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: 'Local Name', profileImage: null, email: null },
      { displayName: 'Google Name' },
    );
    assert.equal(merged.realName, 'Local Name');
  });

  it('fills empty realName from displayName', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      { displayName: '  Ada Lovelace ', givenName: 'X', familyName: 'Y' },
    );
    assert.equal(merged.realName, 'Ada Lovelace');
  });

  it('fills empty realName from given+family only as fallback', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '  ', profileImage: null, email: null },
      { givenName: 'Diego', familyName: 'Hurtado' },
    );
    assert.equal(merged.realName, 'Diego Hurtado');
  });

  it('leaves realName empty when Google has no name data', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      { email: 'a@b.com' },
    );
    assert.equal(merged.realName, '');
  });

  it('keeps existing Firestore email over Firebase Auth and Google', () => {
    const merged = mergeCompleteProfilePrefill(
      {
        realName: '',
        profileImage: null,
        email: 'fs@nearsy.app',
      },
      { email: 'google@nearsy.app' },
      { firebaseAuthEmail: 'auth@nearsy.app' },
    );
    assert.equal(merged.email, 'fs@nearsy.app');
  });

  it('uses Firebase Auth email when Firestore email is empty', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      { email: 'google@nearsy.app' },
      { firebaseAuthEmail: 'auth@nearsy.app' },
    );
    assert.equal(merged.email, 'auth@nearsy.app');
  });

  it('uses Google email when Firestore and Firebase Auth are empty', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: '' },
      { email: 'google@nearsy.app' },
      { firebaseAuthEmail: null },
    );
    assert.equal(merged.email, 'google@nearsy.app');
  });

  it('keeps existing Firestore photo over Google', () => {
    const merged = mergeCompleteProfilePrefill(
      {
        realName: '',
        profileImage: 'https://storage.example/existing.png',
        email: null,
      },
      { photoUrl: 'https://lh3.googleusercontent.com/a/photo' },
    );
    assert.equal(merged.profileImage, 'https://storage.example/existing.png');
  });

  it('keeps local seed photo over Google', () => {
    const merged = mergeCompleteProfilePrefill(
      {
        realName: '',
        profileImage: 'file:///local/photo.jpg',
        email: null,
      },
      { photoUrl: 'https://lh3.googleusercontent.com/a/photo' },
    );
    assert.equal(merged.profileImage, 'file:///local/photo.jpg');
  });

  it('fills empty photo with Google https URL', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      { photoUrl: 'https://lh3.googleusercontent.com/a/photo' },
    );
    assert.equal(
      merged.profileImage,
      'https://lh3.googleusercontent.com/a/photo',
    );
  });

  it('rejects non-https Google photo URLs', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      { photoUrl: 'http://example.com/photo.png' },
    );
    assert.equal(merged.profileImage, null);
  });

  it('does not infer birthYear, phone, or interests', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      {
        displayName: 'Ada',
        email: 'a@b.com',
        photoUrl: 'https://lh3.googleusercontent.com/a/photo',
      } as any,
    );
    assert.equal('birthYear' in merged, false);
    assert.equal('phone' in merged, false);
    assert.equal('interests' in merged, false);
    assert.deepEqual(Object.keys(merged).sort(), [
      'email',
      'profileImage',
      'realName',
    ]);
  });

  it('does not persist email by itself (merge is pure / in-memory only)', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null, email: null },
      { email: 'google@nearsy.app' },
    );
    assert.equal(merged.email, 'google@nearsy.app');
    // merge returns a seed object only; callers persist only on Continue.
  });
});

describe('googleProfilePrefillStore', () => {
  beforeEach(() => {
    clearPendingGoogleProfilePrefill();
  });

  it('consumes pending prefill once for matching uid', () => {
    setPendingGoogleProfilePrefill('uid-1', {
      displayName: 'Ada',
      email: 'ada@example.com',
    });

    const first = consumePendingGoogleProfilePrefill('uid-1');
    assert.equal(first?.displayName, 'Ada');
    assert.equal(consumePendingGoogleProfilePrefill('uid-1'), null);
  });

  it('does not consume prefill for a different uid', () => {
    setPendingGoogleProfilePrefill('uid-1', { displayName: 'Ada' });
    assert.equal(consumePendingGoogleProfilePrefill('uid-2'), null);
    // Original uid can still consume after a mismatched attempt.
    assert.equal(consumePendingGoogleProfilePrefill('uid-1')?.displayName, 'Ada');
  });

  it('clear removes pending prefill', () => {
    setPendingGoogleProfilePrefill('uid-1', { displayName: 'Ada' });
    clearPendingGoogleProfilePrefill();
    assert.equal(consumePendingGoogleProfilePrefill('uid-1'), null);
  });

  it('does not store an empty prefill object', () => {
    setPendingGoogleProfilePrefill('uid-1', {});
    assert.equal(consumePendingGoogleProfilePrefill('uid-1'), null);
  });

  it('contract never includes tokens', () => {
    const prefill = buildGoogleProfilePrefill({
      email: 'a@b.com',
      displayName: 'Ada',
      givenName: 'Ada',
      familyName: 'Lovelace',
      photoUrl: 'https://lh3.googleusercontent.com/a/photo',
    });
    assert.equal('idToken' in prefill, false);
    assert.equal('accessToken' in prefill, false);
    assert.equal('refreshToken' in prefill, false);
    assert.deepEqual(Object.keys(prefill).sort(), [
      'displayName',
      'email',
      'familyName',
      'givenName',
      'photoUrl',
    ]);
  });

  it('simulates remount: consumed prefill is not reapplied', () => {
    setPendingGoogleProfilePrefill('uid-1', {
      displayName: 'First Apply',
      photoUrl: 'https://lh3.googleusercontent.com/a/photo',
    });

    const firstLoad = consumePendingGoogleProfilePrefill('uid-1');
    assert.equal(firstLoad?.displayName, 'First Apply');

    // Remount / useFocusEffect second pass — store already empty.
    const secondLoad = consumePendingGoogleProfilePrefill('uid-1');
    assert.equal(secondLoad, null);
  });
});

describe('authenticateWithGoogle prefill wiring', () => {
  beforeEach(() => {
    clearPendingGoogleProfilePrefill();
  });

  async function commitPrefillForTests(
    uid: string,
    identity: {
      email?: string | null;
      displayName?: string | null;
      givenName?: string | null;
      familyName?: string | null;
      photoUrl?: string | null;
    },
  ) {
    const prefill = buildGoogleProfilePrefill(identity);
    if (Object.keys(prefill).length === 0) return undefined;
    setPendingGoogleProfilePrefill(uid, prefill);
    return prefill;
  }

  it('stores safe prefill keyed by authenticated uid without tokens', async () => {
    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => ({
        idToken: 'secret-id-token',
        email: 'google@nearsy.app',
        displayName: 'Ada Lovelace',
        givenName: 'Ada',
        familyName: 'Lovelace',
        photoUrl: 'https://lh3.googleusercontent.com/a/photo',
      }),
      signInWithIdToken: async (idToken) => {
        assert.equal(idToken, 'secret-id-token');
        return { uid: 'uid-42', email: 'auth@nearsy.app' };
      },
      commitPrefill: commitPrefillForTests,
    });

    const result = await authenticate();

    assert.equal(result.uid, 'uid-42');
    assert.equal(result.email, 'auth@nearsy.app');
    assert.equal(result.prefill?.displayName, 'Ada Lovelace');
    assert.equal(result.prefill?.email, 'google@nearsy.app');
    assert.equal(
      result.prefill?.photoUrl,
      'https://lh3.googleusercontent.com/a/photo',
    );
    assert.equal('idToken' in (result.prefill ?? {}), false);
    assert.equal(JSON.stringify(result).includes('secret-id-token'), false);

    const pending = consumePendingGoogleProfilePrefill('uid-42');
    assert.equal(pending?.displayName, 'Ada Lovelace');
    assert.equal('idToken' in (pending ?? {}), false);
    assert.equal(consumePendingGoogleProfilePrefill('uid-42'), null);
  });

  it('keeps the in-progress guard working with prefill', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const authenticate = createAuthenticateWithGoogle({
      requestIdToken: async () => {
        await gate;
        return {
          idToken: 'id-token',
          displayName: 'Ada',
        };
      },
      signInWithIdToken: async () => ({
        uid: 'uid-1',
        email: 'a@b.com',
      }),
      commitPrefill: commitPrefillForTests,
    });

    const first = authenticate();
    await assert.rejects(
      () => authenticate(),
      (err: unknown) =>
        err instanceof GoogleAuthenticationError &&
        err.code === 'OPERATION_IN_PROGRESS',
    );

    release();
    const result = await first;
    assert.equal(result.uid, 'uid-1');
    assert.equal(consumePendingGoogleProfilePrefill('uid-1')?.displayName, 'Ada');
  });
});
