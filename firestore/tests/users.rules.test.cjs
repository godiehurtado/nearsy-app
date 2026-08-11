/**
 * Firestore rules tests — functional parity with Production (nearsy-pj/(default)).
 * Runs inside: firebase emulators:exec --only firestore
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
const { Timestamp } = require('firebase/firestore');

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

describe('users rules — Production functional parity', () => {
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

  it('owner can get own missing document (exists=false, no permission-denied)', async () => {
    // LinkedIn / Google CRJ: Auth uid exists, users/{uid} not created yet.
    const linkedInUid = 'li_new_user_no_profile';
    const ctx = testEnv.authenticatedContext(linkedInUid);
    const snap = await assertSucceeds(
      ctx.firestore().doc(`users/${linkedInUid}`).get(),
    );
    const exists =
      typeof snap.exists === 'function' ? snap.exists() : snap.exists;
    assert.equal(exists, false);
  });

  it('owner can read own profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/alice').set(ownerDoc());
    });
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(alice.firestore().doc('users/alice').get());
  });

  it('owner can create, update, and delete own profile', async () => {
    const bob = testEnv.authenticatedContext('bob');
    const ref = bob.firestore().doc('users/bob');
    await assertSucceeds(ref.set(ownerDoc({ email: 'bob@example.com' })));
    await assertSucceeds(
      ref.set({ realName: 'Bob Updated', updatedAt: Date.now() }, { merge: true }),
    );
    await assertSucceeds(ref.delete());
  });

  it('other user can read a visible profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/visible')
        .set(ownerDoc({ visibility: true, realName: 'Visible' }));
    });
    const other = testEnv.authenticatedContext('viewer');
    await assertSucceeds(other.firestore().doc('users/visible').get());
  });

  it('other user cannot read an invisible profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/hidden')
        .set(ownerDoc({ visibility: false }));
    });
    const other = testEnv.authenticatedContext('viewer');
    await assertFails(other.firestore().doc('users/hidden').get());
  });

  it('authenticated query visibility == true succeeds', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('users/v1').set(ownerDoc({ visibility: true }));
      await db.doc('users/v2').set(ownerDoc({ visibility: true }));
      await db.doc('users/h1').set(ownerDoc({ visibility: false }));
    });
    const u = testEnv.authenticatedContext('viewer');
    const snap = await assertSucceeds(
      u.firestore().collection('users').where('visibility', '==', true).get(),
    );
    assert.equal(snap.size, 2);
  });

  it('unfiltered users collection query is rejected', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/v1').set(ownerDoc({ visibility: true }));
      await ctx.firestore().doc('users/h1').set(ownerDoc({ visibility: false }));
    });
    const u = testEnv.authenticatedContext('viewer');
    await assertFails(u.firestore().collection('users').get());
  });

  it('unauthenticated cannot read visible profiles or query them', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/v1')
        .set(ownerDoc({ visibility: true }));
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('users/v1').get());
    await assertFails(
      unauth.firestore().collection('users').where('visibility', '==', true).get(),
    );
  });

  it('stranger cannot create, update, or delete another profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/owner').set(ownerDoc());
    });
    const stranger = testEnv.authenticatedContext('stranger');
    await assertFails(
      stranger.firestore().doc('users/newbie').set(ownerDoc()),
    );
    await assertFails(
      stranger
        .firestore()
        .doc('users/owner')
        .set({ realName: 'hack' }, { merge: true }),
    );
    await assertFails(stranger.firestore().doc('users/owner').delete());
  });

  it('owner can use pushTokens subcollection', async () => {
    const u = testEnv.authenticatedContext('tok');
    const ref = u.firestore().doc('users/tok/pushTokens/t1');
    await assertSucceeds(ref.set({ platform: 'android', updatedAt: 1 }));
    await assertSucceeds(ref.get());
    await assertSucceeds(ref.delete());
  });

  it('owner can use contactHashes subcollection', async () => {
    const u = testEnv.authenticatedContext('hash');
    const ref = u.firestore().doc('users/hash/contactHashes/c1');
    await assertSucceeds(ref.set({ hash: 'abc', createdAt: 1 }));
    await assertSucceeds(ref.get());
  });

  it('owner can use blockedUsers subcollection', async () => {
    const u = testEnv.authenticatedContext('blk');
    const ref = u.firestore().doc('users/blk/blockedUsers/other');
    await assertSucceeds(ref.set({ blockedUid: 'other', at: 1 }));
    await assertSucceeds(ref.get());
  });

  it('other user cannot access owner subcollections', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc('users/owner/pushTokens/t1')
        .set({ platform: 'android' });
      await ctx
        .firestore()
        .doc('users/owner/contactHashes/c1')
        .set({ hash: 'x' });
      await ctx
        .firestore()
        .doc('users/owner/blockedUsers/x')
        .set({ blockedUid: 'x' });
    });
    const other = testEnv.authenticatedContext('intruder');
    await assertFails(other.firestore().doc('users/owner/pushTokens/t1').get());
    await assertFails(
      other.firestore().doc('users/owner/contactHashes/c1').set({ hash: 'y' }),
    );
    await assertFails(
      other.firestore().doc('users/owner/blockedUsers/x').delete(),
    );
  });

  it('authenticated can create reports; client cannot read/update/delete', async () => {
    const u = testEnv.authenticatedContext('rep');
    const ref = u.firestore().doc('reports/r1');
    await assertSucceeds(
      ref.set({ reporterUid: 'rep', reason: 'spam', createdAt: 1 }),
    );
    await assertFails(ref.get());
    await assertFails(ref.set({ reason: 'other' }, { merge: true }));
    await assertFails(ref.delete());
  });

  it('authenticated can create moderationEvents; client cannot read/update/delete', async () => {
    const u = testEnv.authenticatedContext('mod');
    const ref = u.firestore().doc('moderationEvents/m1');
    await assertSucceeds(
      ref.set({ actorUid: 'mod', type: 'block', createdAt: 1 }),
    );
    await assertFails(ref.get());
    await assertFails(ref.set({ type: 'x' }, { merge: true }));
    await assertFails(ref.delete());
  });

  it('LinkedIn technical collections deny clients', async () => {
    const u = testEnv.authenticatedContext('li');
    await assertFails(u.firestore().doc('linkedinIdentities/x').get());
    await assertFails(
      u.firestore().doc('linkedinAuthTransactions/x').set({ a: 1 }),
    );
    await assertFails(
      u.firestore().doc('linkedinAuthStateIndex/x').set({ a: 1 }),
    );
  });

  it('unknown collections remain denied', async () => {
    const u = testEnv.authenticatedContext('alice');
    await assertFails(u.firestore().doc('secrets/x').get());
    await assertFails(u.firestore().doc('admin/config').set({ a: 1 }));
  });

  it('accepts Android numeric timestamps and iOS Timestamp values', async () => {
    const android = testEnv.authenticatedContext('android-user');
    await assertSucceeds(
      android.firestore().doc('users/android-user').set({
        email: 'a@ex.com',
        visibility: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const ios = testEnv.authenticatedContext('ios-user');
    await assertSucceeds(
      ios.firestore().doc('users/ios-user').set({
        email: 'i@ex.com',
        visibility: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    );
    await assertSucceeds(
      ios
        .firestore()
        .doc('users/ios-user')
        .set({ updatedAt: Timestamp.now(), realName: 'iOS' }, { merge: true }),
    );
  });
});
