/**
 * Home age/distance saves: what is confirmed, what is shown, and what is sent.
 * Rules behavior is proven separately on the emulator:
 * packages/shared/src/__tests__/android209SearchPrefsRules.emulator.mjs
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/android209SearchPreferencesWriter.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildSearchPreferencesModeWrite,
  createSearchPreferencesWriter,
  searchPreferenceFieldsFromPatch,
  storedSearchPreferenceModes,
  type SearchPreferenceFields,
} from '../visibility/searchPreferencesWriter.ts';
import type {
  ProfileMode,
  VisibilitySearchPreferencesByMode,
} from '../visibility/types.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

// distance.ts uses extensionless imports, which only Metro resolves.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './constants') {
      return next('./constants.ts', context);
    }
    return next(specifier, context);
  },
});

const STORED = { personal: true, professional: true };

function bag(): VisibilitySearchPreferencesByMode {
  return {
    personal: {
      ageMin: 20,
      ageMax: 40,
      maxDistanceMeters: 30,
      interestIds: ['sports_a'],
      updatedAt: 1,
    },
    professional: {
      ageMin: 30,
      ageMax: 50,
      maxDistanceMeters: 15,
      interestIds: [],
      updatedAt: 1,
    },
  };
}

type Sent = {
  mode: ProfileMode;
  fields: SearchPreferenceFields;
  resolve: () => void;
  reject: (err: Error) => void;
};

function harness(opts?: { stored?: typeof STORED; seed?: boolean }) {
  const env = {
    current: true,
    sent: [] as Sent[],
    failures: [] as ProfileMode[],
    shown: bag(),
  };
  const writer = createSearchPreferencesWriter({
    uid: 'uid-a',
    initial: bag(),
    isCurrent: () => env.current,
    write: (mode, fields) =>
      new Promise<void>((resolve, reject) => {
        env.sent.push({ mode, fields, resolve, reject });
      }),
    onChange: (draft) => {
      env.shown = draft;
    },
    onFailure: (mode) => {
      env.failures.push(mode);
    },
    now: () => 1000 + env.sent.length,
  });
  if (opts?.seed !== false) writer.applyRemote(bag(), opts?.stored ?? STORED);
  return { env, writer };
}

const settled = () => new Promise((done) => setTimeout(done, 0));
const boom = () => new Error('denied');

describe('Rapid writes', () => {
  it('sends one at a time and coalesces to the latest intent', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('personal', { maxDistanceMeters: 40 });
    writer.patch('personal', { maxDistanceMeters: 45 });
    assert.equal(env.sent.length, 1, 'never two at once');
    assert.equal(env.shown.personal.maxDistanceMeters, 45);

    env.sent[0].resolve();
    await settled();
    assert.equal(env.sent.length, 2);
    assert.deepEqual(env.sent[1].fields, { maxDistanceMeters: 45 });
    assert.equal(env.shown.personal.maxDistanceMeters, 45);

    env.sent[1].resolve();
    await settled();
    assert.equal(env.sent.length, 2);
    assert.equal(env.failures.length, 0);
  });

  it('a queued age edit keeps a queued distance edit of the same mode', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { ageMin: 21, ageMax: 41 });
    writer.patch('personal', { maxDistanceMeters: 40 });
    writer.patch('personal', { ageMin: 22, ageMax: 42 });
    env.sent[0].resolve();
    await settled();
    assert.deepEqual(env.sent[1].fields, {
      maxDistanceMeters: 40,
      ageMin: 22,
      ageMax: 42,
    });
  });
});

describe('Success then failure', () => {
  it('an older success stays confirmed when the newest write fails', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('personal', { maxDistanceMeters: 40 });
    env.sent[0].resolve();
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 40, 'intent stays shown');

    env.sent[1].reject(boom());
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 35, 'not back to 30');
    assert.deepEqual(env.failures, ['personal']);
  });

  it('a single failure restores what was confirmed and reports once', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { ageMin: 25, ageMax: 45 });
    assert.equal(env.shown.personal.ageMin, 25);
    env.sent[0].reject(boom());
    await settled();
    assert.equal(env.shown.personal.ageMin, 20);
    assert.equal(env.shown.personal.ageMax, 40);
    assert.equal(env.failures.length, 1);
    assert.equal(env.sent.length, 1, 'no automatic retry');
  });

  it('an older failure with a newer intent carries its fields and stays quiet', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('personal', { ageMin: 25, ageMax: 45 });
    env.sent[0].reject(boom());
    await settled();
    assert.equal(env.failures.length, 0);
    assert.equal(env.shown.personal.maxDistanceMeters, 35);
    assert.deepEqual(env.sent[1].fields, {
      maxDistanceMeters: 35,
      ageMin: 25,
      ageMax: 45,
    });
    env.sent[1].resolve();
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 35);
    assert.equal(env.shown.personal.ageMin, 25);
  });

  it('if the carried write fails too, everything unconfirmed goes back', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('personal', { ageMin: 25, ageMax: 45 });
    env.sent[0].reject(boom());
    await settled();
    env.sent[1].reject(boom());
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 30);
    assert.equal(env.shown.personal.ageMin, 20);
    assert.equal(env.failures.length, 1);
  });

  it('after a rollback the next edit starts from what is confirmed', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    env.sent[0].reject(boom());
    await settled();
    writer.patch('personal', { ageMin: 25, ageMax: 45 });
    assert.deepEqual(env.sent[1].fields, { ageMin: 25, ageMax: 45 });
    assert.equal(env.shown.personal.maxDistanceMeters, 30);
  });
});

describe('Out-of-order replies', () => {
  it('a late older reply cannot overwrite the current intent', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('personal', { maxDistanceMeters: 50 });
    // The newer write has not even been sent: there is nothing it can race with.
    assert.equal(env.sent.length, 1);
    env.sent[0].resolve();
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 50);
    env.sent[1].resolve();
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 50);
  });

  it('a read arriving while saving does not overwrite the intent', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    const stale = bag();
    stale.personal.maxDistanceMeters = 12;
    assert.equal(writer.applyRemote(stale, STORED), false);
    assert.equal(env.shown.personal.maxDistanceMeters, 35);
    env.sent[0].resolve();
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 35);
  });

  it('a read after the saves settle is accepted', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    env.sent[0].resolve();
    await settled();
    const fresh = bag();
    fresh.personal.maxDistanceMeters = 12;
    assert.equal(writer.applyRemote(fresh, STORED), true);
    assert.equal(env.shown.personal.maxDistanceMeters, 12);
  });
});

describe('Both modes stay apart', () => {
  it('sends only the edited mode, never a copy of the other', async () => {
    const { env, writer } = harness();
    writer.patch('professional', { maxDistanceMeters: 20 });
    assert.equal(env.sent[0].mode, 'professional');
    assert.deepEqual(env.sent[0].fields, { maxDistanceMeters: 20 });
    assert.deepEqual(
      buildSearchPreferencesModeWrite('professional', env.sent[0].fields, 5),
      { searchPreferences: { professional: { maxDistanceMeters: 20, updatedAt: 5 } } },
    );
  });

  it('never resends untouched fields, so stored interests are not rewritten', () => {
    const { env, writer } = harness();
    writer.patch('personal', { ageMin: 25, ageMax: 45 });
    assert.equal('interestIds' in env.sent[0].fields, false);
    assert.equal('maxDistanceMeters' in env.sent[0].fields, false);
  });

  it('switching mode mid-save keeps each intent on its own mode', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('professional', { maxDistanceMeters: 20 });
    assert.equal(env.shown.personal.maxDistanceMeters, 35);
    assert.equal(env.shown.professional.maxDistanceMeters, 20);
    env.sent[0].resolve();
    await settled();
    assert.equal(env.sent[1].mode, 'professional');
    assert.deepEqual(env.sent[1].fields, { maxDistanceMeters: 20 });
    env.sent[1].resolve();
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 35);
    assert.equal(env.shown.professional.maxDistanceMeters, 20);
  });

  it('a failure on one mode rolls back only that mode', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('professional', { maxDistanceMeters: 20 });
    env.sent[0].reject(boom());
    await settled();
    assert.equal(env.shown.personal.maxDistanceMeters, 30);
    assert.equal(env.shown.professional.maxDistanceMeters, 20);
    assert.deepEqual(env.failures, ['personal']);
    env.sent[1].resolve();
    await settled();
    assert.equal(env.shown.professional.maxDistanceMeters, 20);
  });
});

describe('Session changes', () => {
  it('nothing queued is sent under another account', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    writer.patch('personal', { maxDistanceMeters: 40 });
    env.current = false;
    env.sent[0].resolve();
    await settled();
    assert.equal(env.sent.length, 1);
  });

  it('a reply after the account changed changes nothing and reports nothing', async () => {
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    const before = env.shown;
    writer.dispose();
    env.sent[0].reject(boom());
    await settled();
    assert.equal(env.shown, before);
    assert.equal(env.failures.length, 0);
    assert.equal(writer.patch('personal', { maxDistanceMeters: 40 }), false);
    assert.equal(env.sent.length, 1);
  });

  it('nothing is written before the first read of the account', () => {
    const { env, writer } = harness({ seed: false });
    assert.equal(writer.patch('personal', { maxDistanceMeters: 35 }), false);
    assert.equal(env.sent.length, 0);
  });
});

describe('Stored data is not repaired', () => {
  it('a mode with no stored map gets a complete first write, as the contract needs', async () => {
    const { env, writer } = harness({
      stored: { personal: false, professional: true },
    });
    writer.patch('personal', { maxDistanceMeters: 35 });
    assert.deepEqual(env.sent[0].fields, {
      ageMin: 20,
      ageMax: 40,
      maxDistanceMeters: 35,
      interestIds: ['sports_a'],
    });
    env.sent[0].resolve();
    await settled();
    writer.patch('personal', { maxDistanceMeters: 40 });
    assert.deepEqual(env.sent[1].fields, { maxDistanceMeters: 40 });
  });

  it('a stored map, even an invalid one, only receives the edited fields', () => {
    assert.deepEqual(
      storedSearchPreferenceModes({
        searchPreferences: { personal: { ageMin: 3 }, professional: null },
      }),
      { personal: true, professional: false },
    );
    assert.deepEqual(storedSearchPreferenceModes({}), {
      personal: false,
      professional: false,
    });
    const { env, writer } = harness();
    writer.patch('personal', { maxDistanceMeters: 35 });
    assert.deepEqual(Object.keys(env.sent[0].fields), ['maxDistanceMeters']);
  });

  it('maps patches to exactly their fields', () => {
    assert.deepEqual(
      searchPreferenceFieldsFromPatch({ kind: 'age', ageMin: 18, ageMax: 99 }),
      { ageMin: 18, ageMax: 99 },
    );
    assert.deepEqual(
      searchPreferenceFieldsFromPatch({ kind: 'distance', maxDistanceMeters: 5 }),
      { maxDistanceMeters: 5 },
    );
  });
});

describe('Units, limits and rounding', () => {
  it('every slider stop stays inside the approved range', async () => {
    const distance = await import('../visibility/distance.ts');
    const constants = await import('../visibility/constants.ts');
    const RULES_MIN = 5;
    const RULES_MAX = 60.96;
    for (let ft = 20; ft <= 200; ft += 5) {
      const meters = distance.canonicalFromDisplayDistance(ft, 'ft');
      assert.ok(meters >= RULES_MIN && meters <= RULES_MAX, `${ft} ft = ${meters}`);
      assert.equal(distance.presentDistanceFromCanonical(meters, 'ft'), ft, 'round trip');
    }
    for (let m = 5; m <= 60; m += 5) {
      const meters = distance.canonicalFromDisplayDistance(m, 'm');
      assert.equal(meters, m);
      assert.equal(distance.presentDistanceFromCanonical(meters, 'm'), m);
    }
    assert.ok(constants.MAX_DISTANCE_METERS <= RULES_MAX);
    assert.equal(constants.MIN_VISIBILITY_AGE, 18);
    assert.equal(constants.MAX_VISIBILITY_AGE, 99);
  });
});

describe('Product scope on Home', () => {
  const home = readFileSync(join(SRC, 'screens/MainHomeScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const persist = home.slice(
    home.indexOf('showPrefsSaveErrorRef.current = () =>'),
    home.indexOf('const activateVisibility'),
  );

  it('a save failure shows its own message and touches no Visibility state', () => {
    assert.match(persist, /home\.errors\.preferencesSave/);
    assert.doesNotMatch(
      persist,
      /setVisibilityError|activateVisibility|presentUnknownVisibilityError|home\.errors\.generic/,
    );
  });

  it('saving triggers no matching or reevaluate', () => {
    assert.doesNotMatch(persist, /reevaluate|matching|runNearby|discovery/i);
    const store = readFileSync(join(SRC, 'visibility/searchPreferencesStore.ts'), 'utf8');
    assert.doesNotMatch(store, /reevaluate|httpsCallable/i);
  });

  it('interests stay hidden', () => {
    const flag = readFileSync(join(SRC, 'product/mvpFreePresentation.ts'), 'utf8');
    assert.match(flag, /MVP_FREE_SHOW_INTEREST_SEARCH_FILTER = false/);
    assert.match(home, /\{MVP_FREE_SHOW_INTEREST_SEARCH_FILTER \?/);
  });

  it('there is no second source of truth for the rules', () => {
    assert.throws(() =>
      readFileSync(join(SRC, 'visibility/searchPreferencesRulesMirror.ts')),
    );
  });
});
