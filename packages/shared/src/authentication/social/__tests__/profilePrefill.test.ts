import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { normalizeSocialProfileData } from '../application/normalizeSocialProfileData';
import {
  isEmptyPrefillValue,
  mapSocialNameToRealName,
  mergeCompleteProfilePrefill,
  sanitizeSocialPhotoUrl,
} from '../application/mergeCompleteProfilePrefill';
import {
  clearPendingSocialProfilePrefill,
  consumePendingSocialProfilePrefill,
  peekPendingSocialProfilePrefill,
  setPendingSocialProfilePrefill,
} from '../application/socialProfilePrefillStore';
import { createAuthenticateWithGoogle } from '../application/authenticateWithGoogle';
import { createSocialProviderRegistry } from '../application/providerRegistry';
import type { SocialAuthenticationProviderAdapter } from '../application/socialAuthenticationPort';
import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import type { FirebaseAuthenticationPort } from '../infrastructure/firebase/firebaseAuthenticationPort';

describe('normalizeSocialProfileData', () => {
  it('strips tokens and trims profile fields', () => {
    const normalized = normalizeSocialProfileData({
      provider: 'google',
      providerUserId: '  g-1  ',
      idToken: 'secret-token',
      accessToken: 'secret-access',
      email: '  user@example.com ',
      displayName: '  Ada Lovelace ',
      givenName: ' Ada ',
      familyName: ' Lovelace ',
      photoUrl: ' https://lh3.googleusercontent.com/a/photo ',
      locale: ' en-US ',
    });

    assert.equal(normalized.provider, 'google');
    assert.equal(normalized.providerUserId, 'g-1');
    assert.equal(normalized.email, 'user@example.com');
    assert.equal(normalized.displayName, 'Ada Lovelace');
    assert.equal(normalized.givenName, 'Ada');
    assert.equal(normalized.familyName, 'Lovelace');
    assert.equal(
      normalized.photoUrl,
      'https://lh3.googleusercontent.com/a/photo',
    );
    assert.equal(normalized.locale, 'en-US');
    assert.equal('idToken' in normalized, false);
    assert.equal('accessToken' in normalized, false);
  });

  it('drops missing optional fields', () => {
    const normalized = normalizeSocialProfileData({
      provider: 'google',
      providerUserId: 'g-1',
      givenName: '   ',
      familyName: undefined,
      photoUrl: '',
    });

    assert.equal(normalized.givenName, undefined);
    assert.equal(normalized.familyName, undefined);
    assert.equal(normalized.photoUrl, undefined);
    assert.equal(normalized.displayName, undefined);
  });
});

describe('mergeCompleteProfilePrefill', () => {
  it('treats whitespace as empty', () => {
    assert.equal(isEmptyPrefillValue('   '), true);
    assert.equal(isEmptyPrefillValue('0'), false);
  });

  it('maps given + family to realName without splitting displayName', () => {
    assert.equal(
      mapSocialNameToRealName({
        givenName: 'Diego',
        familyName: 'Hurtado',
        displayName: 'Should Not Win',
      }),
      'Diego Hurtado',
    );
    assert.equal(
      mapSocialNameToRealName({
        displayName: 'Ada Lovelace',
      }),
      'Ada Lovelace',
    );
    assert.equal(
      mapSocialNameToRealName({
        givenName: 'Diego',
        displayName: 'Ignored When Given Present',
      }),
      'Diego',
    );
  });

  it('keeps existing Firestore/local values over Google', () => {
    const merged = mergeCompleteProfilePrefill(
      {
        realName: 'Diego',
        profileImage: 'https://nearsy.example/existing.jpg',
        email: 'existing@nearsy.app',
      },
      {
        provider: 'google',
        givenName: 'Diego Andrés',
        familyName: 'Other',
        photoUrl: 'https://lh3.googleusercontent.com/new.jpg',
        email: 'google@example.com',
      },
    );

    assert.equal(merged.realName, 'Diego');
    assert.equal(merged.profileImage, 'https://nearsy.example/existing.jpg');
    assert.equal(merged.email, 'existing@nearsy.app');
  });

  it('fills empty fields from Google and ignores empty Google values', () => {
    const merged = mergeCompleteProfilePrefill(
      {
        realName: '  ',
        profileImage: null,
        email: null,
      },
      {
        provider: 'google',
        givenName: 'Ada',
        familyName: 'Lovelace',
        photoUrl: 'https://lh3.googleusercontent.com/a.png',
        email: 'ada@example.com',
        displayName: '',
      },
    );

    assert.equal(merged.realName, 'Ada Lovelace');
    assert.equal(
      merged.profileImage,
      'https://lh3.googleusercontent.com/a.png',
    );
    assert.equal(merged.email, 'ada@example.com');
  });

  it('never infers birth year, phone, or interests fields', () => {
    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null },
      {
        provider: 'google',
        givenName: 'Ada',
        locale: 'es-CO',
        photoUrl: 'https://example.com/p.png',
      },
    );

    assert.equal('birthYear' in merged, false);
    assert.equal('phone' in merged, false);
    assert.equal('personalInterests' in merged, false);
    assert.equal(merged.realName, 'Ada');
  });

  it('ignores invalid photo URLs', () => {
    assert.equal(sanitizeSocialPhotoUrl('not a url'), undefined);
    assert.equal(sanitizeSocialPhotoUrl('ftp://x/y'), undefined);
    assert.equal(
      sanitizeSocialPhotoUrl('https://lh3.googleusercontent.com/a.png'),
      'https://lh3.googleusercontent.com/a.png',
    );

    const merged = mergeCompleteProfilePrefill(
      { realName: '', profileImage: null },
      {
        provider: 'google',
        photoUrl: 'javascript:alert(1)',
      },
    );
    assert.equal(merged.profileImage, null);
  });
});

describe('socialProfilePrefillStore', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  it('stores and consumes once for matching uid', () => {
    setPendingSocialProfilePrefill('uid-1', {
      provider: 'google',
      givenName: 'Ada',
    });
    assert.ok(peekPendingSocialProfilePrefill());
    const first = consumePendingSocialProfilePrefill('uid-1');
    assert.equal(first?.givenName, 'Ada');
    assert.equal(consumePendingSocialProfilePrefill('uid-1'), null);
  });

  it('ignores consume for mismatched uid', () => {
    setPendingSocialProfilePrefill('uid-1', {
      provider: 'google',
      givenName: 'Ada',
    });
    assert.equal(consumePendingSocialProfilePrefill('uid-2'), null);
    assert.equal(consumePendingSocialProfilePrefill('uid-1')?.givenName, 'Ada');
  });
});

describe('authenticateWithGoogle prefill wiring', () => {
  beforeEach(() => {
    clearPendingSocialProfilePrefill();
  });

  function createMockProvider(
    result: ProviderAuthenticationResult,
  ): SocialAuthenticationProviderAdapter {
    return {
      provider: 'google',
      async isAvailable() {
        return true;
      },
      async configure() {},
      async authenticate() {
        return result;
      },
    };
  }

  function createMockFirebase(): FirebaseAuthenticationPort {
    return {
      async signInWithSocialCredential() {
        return {
          uid: 'firebase-uid',
          email: 'user@example.com',
          isNewUser: true,
          linkedProviderIds: ['google.com'],
        };
      },
    };
  }

  it('queues safe prefill for missing profiles and omits tokens', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          provider: 'google',
          providerUserId: 'g-1',
          idToken: 'secret',
          accessToken: 'secret-access',
          email: 'user@example.com',
          givenName: 'Ada',
          familyName: 'Lovelace',
          photoUrl: 'https://lh3.googleusercontent.com/a.png',
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => null,
      isProfileComplete: async () => false,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');
    assert.equal(result.socialProfile?.givenName, 'Ada');
    assert.equal('idToken' in (result.socialProfile ?? {}), false);

    const pending = peekPendingSocialProfilePrefill();
    assert.equal(pending?.uid, 'firebase-uid');
    assert.equal(pending?.socialProfile.familyName, 'Lovelace');
    assert.equal('idToken' in (pending?.socialProfile ?? {}), false);
  });

  it('routes complete profiles to MainTabs without pending prefill', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          provider: 'google',
          providerUserId: 'g-1',
          idToken: 'secret',
          givenName: 'Ada',
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ realName: 'Ada' }),
      isProfileComplete: async () => true,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'MainTabs');
    assert.equal(result.socialProfile, undefined);
    assert.equal(peekPendingSocialProfilePrefill(), null);
  });

  it('merges incomplete Firestore profiles with Google for empty fields only', async () => {
    const authenticate = createAuthenticateWithGoogle({
      registry: createSocialProviderRegistry({
        google: createMockProvider({
          provider: 'google',
          providerUserId: 'g-1',
          idToken: 'secret',
          givenName: 'GoogleName',
          photoUrl: 'https://lh3.googleusercontent.com/a.png',
        }),
      }),
      firebaseAuth: createMockFirebase(),
      getUserProfile: async () => ({ realName: 'Diego', profileImage: null }),
      isProfileComplete: async () => false,
    });

    const result = await authenticate();
    assert.equal(result.profileRoute, 'CompleteProfile');

    const social = consumePendingSocialProfilePrefill('firebase-uid');
    const merged = mergeCompleteProfilePrefill(
      { realName: 'Diego', profileImage: null },
      social!,
    );
    assert.equal(merged.realName, 'Diego');
    assert.equal(
      merged.profileImage,
      'https://lh3.googleusercontent.com/a.png',
    );
  });
});
