/**
 * Authorization for users/{uid}/pushTokens/{token} against the real
 * nearsy-functions Firestore rules snapshot (not a mock isOwner).
 *
 * Run from this directory:
 *   npm install
 *   npm test
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, it, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-nearsy-rules';
const RULES = readFileSync(join(__dirname, 'firestore.rules'), 'utf8');
const TOKEN = 'ExponentPushToken[device]';
const PATH_A = `users/uid-a/pushTokens/${TOKEN}`;
const PATH_B = `users/uid-b/pushTokens/${TOKEN}`;

function tokenDoc() {
  return {
    token: TOKEN,
    platform: 'android',
    updatedAt: Date.now(),
  };
}

describe('pushTokens authorization — nearsy-functions rules', () => {
  /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
        host: '127.0.0.1',
        port: 8099,
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('A can set and delete this-device token under A', async () => {
    const a = testEnv.authenticatedContext('uid-a');
    const ref = a.firestore().doc(PATH_A);
    await assertSucceeds(ref.set(tokenDoc()));
    await assertSucceeds(ref.delete());
  });

  it('B cannot compensating-delete A after the session already changed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(PATH_A).set(tokenDoc());
    });
    const b = testEnv.authenticatedContext('uid-b');
    await assertFails(b.firestore().doc(PATH_A).delete());
  });

  it('B cannot persist a late register under A', async () => {
    const b = testEnv.authenticatedContext('uid-b');
    await assertFails(b.firestore().doc(PATH_A).set(tokenDoc()));
  });

  it('unauthenticated cannot set or delete push tokens', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(PATH_A).set(tokenDoc());
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc(PATH_A).delete());
    await assertFails(unauth.firestore().doc(PATH_A).set(tokenDoc()));
  });

  it('A with a still-valid Auth token can recreate pushTokens after the user doc is gone', async () => {
    const a = testEnv.authenticatedContext('uid-a');
    await assertSucceeds(
      a.firestore().doc('users/uid-a').set({
        email: 'a@example.com',
        visibility: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await assertSucceeds(a.firestore().doc(PATH_A).set(tokenDoc()));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(PATH_A).delete();
      await ctx.firestore().doc('users/uid-a').delete();
    });
    await assertSucceeds(a.firestore().doc(PATH_A).set(tokenDoc()));
  });

  it('B can still register this device under B without touching A', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(PATH_A).set(tokenDoc());
    });
    const b = testEnv.authenticatedContext('uid-b');
    await assertSucceeds(b.firestore().doc(PATH_B).set(tokenDoc()));
    await assertFails(b.firestore().doc(PATH_A).delete());
  });
});
