/**
 * Visibility & Discovery Firestore rules tests.
 * Emulator only — project demo-nearsy-rules (never nearsy-dev / nearsy-pj).
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-nearsy-rules';
const RULES = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

function ownerDoc(overrides = {}) {
  return {
    email: 'owner@example.com',
    visibility: false,
    profileSetupCompleted: false,
    realName: 'Owner',
    updatedAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

function validPrefs(overrides = {}) {
  return {
    ageMin: 21,
    ageMax: 45,
    maxDistanceMeters: 30,
    interestIds: ['hiking', 'music'],
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('visibility & discovery rules', () => {
  /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
        host: '127.0.0.1',
        port: 8088,
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('owner can read and write allowed fields on own document', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertSucceeds(ref.set(ownerDoc()));
    await assertSucceeds(
      ref.set(
        {
          realName: 'Alice CRJ',
          bio: 'hello',
          personalGallery: [{ id: 'p1', url: 'https://example.com/a.jpg' }],
          personalOnboardingInterests: [{ id: 'hiking', name: 'Hiking' }],
          topBarColor: '#112233',
          mode: 'personal',
        },
        { merge: true },
      ),
    );
    const snap = await assertSucceeds(ref.get());
    assert.equal(snap.data().realName, 'Alice CRJ');
  });

  it('user cannot read another users/{uid} document', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/hidden')
        .set(ownerDoc({ visibility: false }));
      await ctx
        .firestore()
        .doc('users/visible')
        .set(ownerDoc({ visibility: true, realName: 'Visible' }));
    });
    const other = testEnv.authenticatedContext('viewer');
    await assertFails(other.firestore().doc('users/hidden').get());
    await assertFails(other.firestore().doc('users/visible').get());
  });

  it('unauthenticated requests are rejected', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/v1').set(ownerDoc({ visibility: true }));
      await ctx
        .firestore()
        .doc('users/v1/blockedUsers/x')
        .set({ blockedUid: 'x', at: 1 });
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('users/v1').get());
    await assertFails(
      unauth.firestore().doc('users/v1').set({ realName: 'x' }, { merge: true }),
    );
    await assertFails(unauth.firestore().doc('discoveryProfiles/v1').get());
    await assertFails(
      unauth.firestore().doc('users/v1/blockedUsers/x').get(),
    );
  });

  it('client cannot read discoveryProfiles', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('discoveryProfiles/alice').set({
        schemaVersion: 2,
        geohash: 'abc',
      });
    });
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(alice.firestore().doc('discoveryProfiles/alice').get());
    await assertFails(alice.firestore().collection('discoveryProfiles').get());
  });

  it('client cannot write discoveryProfiles projection', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().doc('discoveryProfiles/alice').set({ uid: 'alice' }),
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('discoveryProfiles/alice').set({ geohash: 'x' });
    });
    await assertFails(
      alice
        .firestore()
        .doc('discoveryProfiles/alice')
        .set({ geohash: 'hack' }, { merge: true }),
    );
    await assertFails(alice.firestore().doc('discoveryProfiles/alice').delete());
  });

  it('client cannot alter visibility', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertFails(ref.set(ownerDoc({ visibility: true })));
    await assertSucceeds(ref.set(ownerDoc({ visibility: false })));
    await assertFails(ref.set({ visibility: true }, { merge: true }));
  });

  it('client cannot alter schemaVersion', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().doc('users/alice').set(ownerDoc({ schemaVersion: 2 })),
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/alice')
        .set(ownerDoc({ schemaVersion: 2 }));
    });
    await assertFails(
      alice
        .firestore()
        .doc('users/alice')
        .set({ schemaVersion: 3, realName: 'x' }, { merge: true }),
    );
    await assertSucceeds(
      alice
        .firestore()
        .doc('users/alice')
        .set({ realName: 'Alice' }, { merge: true }),
    );
  });

  it('client cannot write authoritative location keys', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertSucceeds(ref.set(ownerDoc({ location: null })));
    await assertFails(
      ref.set(
        {
          location: {
            latitude: 4.6,
            longitude: -74.0,
            accuracyMeters: 8,
            observedAt: Date.now(),
            confirmedAt: Date.now(),
            updatedAt: Date.now(),
            geohash: 'd2g6',
          },
        },
        { merge: true },
      ),
    );
  });

  it('legacy lat/lng location writes remain allowed when no authoritative keys exist', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertSucceeds(ref.set(ownerDoc({ location: null })));
    await assertSucceeds(
      ref.set(
        {
          location: {
            lat: 4.6,
            lng: -74.0,
            updatedAt: Date.now(),
            accuracy: 12,
          },
        },
        { merge: true },
      ),
    );
  });

  it('client cannot drop or overwrite existing authoritative location', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/alice')
        .set(
          ownerDoc({
            location: {
              lat: 1,
              lng: 2,
              latitude: 4.6,
              longitude: -74.0,
              accuracyMeters: 5,
              observedAt: 1,
              confirmedAt: 2,
              updatedAt: 3,
              geohash: 'd2g6',
            },
          }),
        );
    });
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().doc('users/alice').set(
        {
          location: {
            lat: 9,
            lng: 9,
            updatedAt: Date.now(),
            accuracy: 1,
          },
        },
        { merge: true },
      ),
    );
  });

  it('valid search preferences are accepted', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertSucceeds(ref.set(ownerDoc()));
    await assertSucceeds(
      ref.set(
        {
          searchPreferences: {
            personal: validPrefs(),
            professional: validPrefs({
              ageMin: 18,
              ageMax: 99,
              maxDistanceMeters: 5,
              interestIds: [],
            }),
          },
        },
        { merge: true },
      ),
    );
  });

  it('invalid ages and distances are rejected', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertSucceeds(ref.set(ownerDoc()));
    await assertFails(
      ref.set(
        {
          searchPreferences: {
            personal: validPrefs({ ageMin: 17, ageMax: 40 }),
          },
        },
        { merge: true },
      ),
    );
    await assertFails(
      ref.set(
        {
          searchPreferences: {
            personal: validPrefs({ ageMin: 40, ageMax: 21 }),
          },
        },
        { merge: true },
      ),
    );
    await assertFails(
      ref.set(
        {
          searchPreferences: {
            personal: validPrefs({ maxDistanceMeters: 4.9 }),
          },
        },
        { merge: true },
      ),
    );
    await assertFails(
      ref.set(
        {
          searchPreferences: {
            personal: validPrefs({ maxDistanceMeters: 61 }),
          },
        },
        { merge: true },
      ),
    );
    await assertFails(
      ref.set(
        {
          searchPreferences: {
            personal: validPrefs({ extra: true }),
          },
        },
        { merge: true },
      ),
    );
  });

  it('allowed CRJ field updates succeed without touching visibility', async () => {
    const alice = testEnv.authenticatedContext('alice');
    const ref = alice.firestore().doc('users/alice');
    await assertSucceeds(
      ref.set(
        ownerDoc({
          profiles: {
            personal: { realName: 'A', bio: '' },
            professional: { realName: 'A', company: '' },
          },
        }),
      ),
    );
    await assertSucceeds(
      ref.set(
        {
          profiles: {
            personal: { realName: 'Alice', lastName: 'One', bio: 'x' },
            professional: { realName: 'Alice', occupation: 'Dev', company: 'Co' },
          },
          personalOnboardingInterests: [{ id: 'a', name: 'A' }],
          professionalGallery: [],
          topBarMode: 'color',
          topBarColor: '#3B5A85',
          profileSetupCompleted: true,
        },
        { merge: true },
      ),
    );
    const snap = await ref.get();
    assert.equal(snap.data().visibility, false);
  });

  it('blockedUsers owner is allowed', async () => {
    const u = testEnv.authenticatedContext('blk');
    const ref = u.firestore().doc('users/blk/blockedUsers/other');
    await assertSucceeds(
      ref.set({ blockedUid: 'other', createdAt: Date.now(), source: 'profile_detail' }),
    );
    await assertSucceeds(ref.get());
    await assertSucceeds(ref.delete());
  });

  it('blockedUsers stranger is rejected', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/owner/blockedUsers/x')
        .set({ blockedUid: 'x', at: 1 });
    });
    const other = testEnv.authenticatedContext('intruder');
    await assertFails(other.firestore().doc('users/owner/blockedUsers/x').get());
    await assertFails(
      other.firestore().doc('users/owner/blockedUsers/x').set({ blockedUid: 'x' }),
    );
    await assertFails(
      other.firestore().doc('users/owner/blockedUsers/x').delete(),
    );
  });
});
