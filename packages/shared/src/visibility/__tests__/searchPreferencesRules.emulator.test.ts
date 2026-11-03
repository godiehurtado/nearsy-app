/**
 * Home filters write path vs the REAL Firestore rules (emulator, opt-in).
 *
 * Skipped unless all of these are set (nothing here touches production):
 *   FIRESTORE_EMULATOR_HOST       set by `firebase emulators:exec`
 *   NEARSY_RULES_FILE             path to Functions firestore/firestore.rules (read-only)
 *   NEARSY_RULES_TESTING_DIR      dir whose node_modules has @firebase/rules-unit-testing + firebase
 *
 * The payload under test is produced by the same client helpers the app uses
 * (prepareSearchPreferencesForPersist + buildSearchPreferencesModeUpdate).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  buildSearchPreferencesModeUpdate,
  prepareSearchPreferencesForPersist,
} from '../preferences';
import type { VisibilitySearchPreferences } from '../types';

const rulesFile = process.env.NEARSY_RULES_FILE;
const testingDir = process.env.NEARSY_RULES_TESTING_DIR;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const enabled = Boolean(rulesFile && testingDir && emulatorHost);

const UID = 'filters_owner';
const MAX_UI_METERS = 200 / 3.28084;

function validPrefs(
  overrides: Partial<VisibilitySearchPreferences> = {},
): VisibilitySearchPreferences {
  return {
    ageMin: 18,
    ageMax: 99,
    maxDistanceMeters: 30,
    interestIds: [],
    updatedAt: 1730570000000,
    ...overrides,
  };
}

function ownerDoc(searchPreferences: Record<string, unknown>, extra = {}) {
  return {
    email: 'owner@example.com',
    visibility: true,
    profileSetupCompleted: false,
    realName: 'Owner',
    updatedAt: 1730570000000,
    createdAt: 1730570000000,
    searchPreferences,
    ...extra,
  };
}

/**
 * The emulator lists one reason per evaluated rule branch. A functional
 * rejection includes at least one `false for 'update'` (it may ALSO list
 * budget messages for other branches). A pure budget denial lists only
 * "maximum of 1000 expressions" reasons.
 */
function denialKind(err: unknown): 'budget-only' | 'functional' | 'other' {
  const text = String((err as Error)?.message ?? err);
  if (/false for 'update'/.test(text)) return 'functional';
  if (/maximum of 1000 expressions/.test(text)) return 'budget-only';
  return 'other';
}

function prepared(
  prefs: VisibilitySearchPreferences,
  knownIds: ReadonlySet<string> = new Set<string>(),
): VisibilitySearchPreferences {
  const out = prepareSearchPreferencesForPersist(prefs, knownIds);
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error('unreachable');
  return out.prefs;
}

describe('Home filters nested write vs real rules (emulator)', { skip: !enabled }, () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let testEnv: any;
  let assertSucceeds: (p: Promise<unknown>) => Promise<unknown>;
  let assertFails: (p: Promise<unknown>) => Promise<unknown>;
  let serverTimestamp: () => unknown;

  before(async () => {
    const req = createRequire(join(testingDir!, 'package.json'));
    const rut = req('@firebase/rules-unit-testing');
    assertSucceeds = rut.assertSucceeds;
    assertFails = rut.assertFails;
    const compat = req('firebase/compat/app');
    req('firebase/compat/firestore');
    serverTimestamp = () =>
      (compat.default ?? compat).firestore.FieldValue.serverTimestamp();
    const [host, port] = emulatorHost!.split(':');
    testEnv = await rut.initializeTestEnvironment({
      projectId: 'demo-nearsy-home-filters',
      firestore: {
        rules: readFileSync(rulesFile!, 'utf8'),
        host,
        port: Number(port),
      },
    });
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const seed = async (data: Record<string, unknown>) => {
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      await ctx.firestore().doc(`users/${UID}`).set(data);
    });
  };

  const writeMode = (
    uid: string,
    mode: 'personal' | 'professional',
    prefs: VisibilitySearchPreferences,
  ) =>
    testEnv
      .authenticatedContext(uid)
      .firestore()
      .doc(`users/${UID}`)
      .update(buildSearchPreferencesModeUpdate(mode, prefs, serverTimestamp()));

  it('accepts an active-mode distance change when the stored doc is valid', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    await assertSucceeds(
      writeMode(UID, 'personal', prepared(validPrefs({ maxDistanceMeters: 45 }))),
    );
  });

  it('accepts the UI max distance (200 ft) and rejects > 60.96 m', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    await assertSucceeds(
      writeMode(UID, 'personal', prepared(validPrefs({ maxDistanceMeters: MAX_UI_METERS }))),
    );
    await assertFails(
      writeMode(UID, 'personal', validPrefs({ maxDistanceMeters: 60.97 })),
    );
  });

  it('rejects fractional ages; client coercion makes the same edit pass', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    await assertFails(
      writeMode(UID, 'personal', validPrefs({ ageMin: 25.2, ageMax: 40.8 })),
    );
    await assertSucceeds(
      writeMode(UID, 'personal', prepared(validPrefs({ ageMin: 25.2, ageMax: 40.8 }))),
    );
  });

  it('nested write does not send the local inactive bag (invalid only on the client)', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    // The old full-bag write would carry this invalid local professional bag.
    await assertFails(
      testEnv
        .authenticatedContext(UID)
        .firestore()
        .doc(`users/${UID}`)
        .update({
          searchPreferences: {
            personal: prepared(validPrefs({ maxDistanceMeters: 40 })),
            professional: validPrefs({ ageMin: 17 }),
          },
          updatedAt: serverTimestamp(),
        }),
    );
    await assertSucceeds(
      writeMode(UID, 'personal', prepared(validPrefs({ maxDistanceMeters: 40 }))),
    );
  });

  it('rules validate the post-merge bag: an invalid STORED inactive bag still rejects', async () => {
    await seed(
      ownerDoc({
        personal: validPrefs(),
        professional: validPrefs({ ageMin: 17 }),
      }),
    );
    const err = await assertFails(
      writeMode(UID, 'personal', prepared(validPrefs({ maxDistanceMeters: 40 }))),
    );
    // Functional rejection (`false for 'update'`), not budget exhaustion.
    assert.equal(denialKind(err), 'functional');
  });

  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `interest_${i}_tech`);

  /** Seeds, then returns a thunk (an awaited Promise would throw early). */
  const seedWithInterests = async (active: number, inactive: number) => {
    await seed(
      ownerDoc({
        personal: validPrefs({ interestIds: ids(active) }),
        professional: validPrefs({ interestIds: ids(inactive) }),
      }),
    );
    return () =>
      writeMode(
      UID,
      'personal',
      prepared(
        validPrefs({ interestIds: ids(active), maxDistanceMeters: 50 }),
        new Set(ids(12)),
      ),
    );
  };

  it('accepts a distance change with 5+5 and 10+0 interests', async () => {
    await assertSucceeds((await seedWithInterests(5, 5))());
    await assertSucceeds((await seedWithInterests(10, 0))());
  });

  it('a functional rejection reports `false for` (not budget-only)', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    const err = await assertFails(
      writeMode(UID, 'personal', validPrefs({ maxDistanceMeters: 60.97 })),
    );
    assert.equal(denialKind(err), 'functional');
  });

  /**
   * KNOWN BACKEND DEFECT (Functions firestore.rules, not fixed here): the
   * post-merge bag check (validInterestIdAt x12 per mode) exhausts the rules
   * 1000-expression budget once both modes hold > ~10 interests in total, so
   * a VALID filters write is PERMISSION_DENIED with ONLY budget messages.
   * When Functions fixes the rules: replace this test's assertFails/denialKind
   * with assertSucceeds for the same fixtures (6+6, 0+12, 11+0) and rename it.
   */
  it('KNOWN DEFECT: valid write denied with 6+6, 0+12, 11+0 interests (expression budget only)', async () => {
    for (const [active, inactive] of [
      [6, 6],
      [0, 12],
      [11, 0],
    ] as const) {
      const err = await assertFails(
        (await seedWithInterests(active, inactive))(),
      );
      assert.equal(denialKind(err), 'budget-only', `${active}+${inactive}`);
    }
  });

  it('another account cannot write this user filters', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    await assertFails(
      writeMode('someone_else', 'personal', prepared(validPrefs())),
    );
  });

  it('a filters-only write never changes visibility', async () => {
    await seed(ownerDoc({ personal: validPrefs(), professional: validPrefs() }));
    await assertSucceeds(
      writeMode(UID, 'professional', prepared(validPrefs({ maxDistanceMeters: 12 }))),
    );
    let data: any;
    await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
      data = (await ctx.firestore().doc(`users/${UID}`).get()).data();
    });
    assert.equal(data.visibility, true);
    assert.equal(data.searchPreferences.professional.maxDistanceMeters, 12);
    assert.equal(data.searchPreferences.personal.maxDistanceMeters, 30);
  });
});
